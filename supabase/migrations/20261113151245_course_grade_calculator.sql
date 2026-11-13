-- Configurable course weights and private student what-if simulations.
-- No official grade or existing course configuration is seeded or changed.
create table private.course_grade_schemes (
  course_id uuid primary key references public.courses(id) on delete cascade,
  activities jsonb not null check (jsonb_typeof(activities)='array'),
  reference_grade numeric(5,2) not null check (reference_grade between 0 and 100),
  revision integer not null check (revision>0),
  updated_at timestamptz not null default now()
);
create table private.student_grade_simulations (
  student_id uuid primary key references public.students(id) on delete cascade,
  grades jsonb not null check (jsonb_typeof(grades)='object'),
  goal numeric(5,2) not null check (goal between 0 and 100),
  scheme_revision integer not null check (scheme_revision>0),
  revision integer not null check (revision>0),
  updated_at timestamptz not null default now()
);
alter table private.course_grade_schemes enable row level security;
alter table private.student_grade_simulations enable row level security;
revoke all on private.course_grade_schemes, private.student_grade_simulations from public,anon,authenticated,service_role;
-- Defense in depth: these relations are not exposed; writes go through validated RPCs.
create policy grade_scheme_course_member on private.course_grade_schemes for select to authenticated
  using (exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=(select auth.uid()))
    or exists(select 1 from public.students s where s.course_id=course_grade_schemes.course_id
      and s.auth_user_id=(select auth.uid()) and s.phone is not null));
create policy grade_simulation_owner on private.student_grade_simulations for select to authenticated
  using (exists(select 1 from public.students s where s.id=student_id and s.auth_user_id=(select auth.uid())));

create function private.teacher_grade_scheme(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.courses
    where id=p_course_id and teacher_id=(select auth.uid())) then
    raise exception 'Acceso docente requerido' using errcode='42501';
  end if;
  return (select jsonb_build_object('activities',g.activities,'referenceGrade',g.reference_grade,
    'revision',g.revision,'updatedAt',g.updated_at) from private.course_grade_schemes g where g.course_id=p_course_id);
end;
$$;

create function private.teacher_save_grade_scheme(
  p_course_id uuid,p_activities jsonb,p_reference_grade numeric,p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.courses%rowtype; g private.course_grade_schemes%rowtype;
  activity jsonb; activity_id text; activity_name text; weight numeric;
  total numeric:=0; ids text[]:='{}'; cleaned jsonb:='[]';
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  -- Parent lock also serializes the first publication, when no scheme exists yet.
  select * into c from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if not c.active then raise exception 'Restaura la materia antes de configurar la calculadora' using errcode='22023'; end if;
  select * into g from private.course_grade_schemes where course_id=p_course_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(g.revision,0) then
    raise exception 'La configuración cambió en otro dispositivo. Recárgala antes de guardar.' using errcode='PT409';
  end if;
  if p_reference_grade is null or p_reference_grade not between 0 and 100 or p_reference_grade<>round(p_reference_grade,2) then
    raise exception 'La meta debe estar entre 0 y 100, con hasta dos decimales' using errcode='22023';
  end if;
  if p_activities is null or jsonb_typeof(p_activities)<>'array' or octet_length(p_activities::text)>32768 then
    raise exception 'Revisa las actividades' using errcode='22023';
  end if;
  if jsonb_array_length(p_activities) not between 1 and 30 then
    raise exception 'Agrega entre 1 y 30 actividades' using errcode='22023';
  end if;
  for activity in select value from jsonb_array_elements(p_activities) loop
    if jsonb_typeof(activity)<>'object' or jsonb_typeof(activity->'id') is distinct from 'string'
      or jsonb_typeof(activity->'name') is distinct from 'string' or jsonb_typeof(activity->'weight') is distinct from 'number' then
      raise exception 'Revisa los nombres y porcentajes' using errcode='22023';
    end if;
    activity_id:=activity->>'id'; activity_name:=btrim(activity->>'name'); weight:=(activity->>'weight')::numeric;
    if activity_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or activity_id=any(ids)
      or char_length(activity_name) not between 1 and 100 or weight<=0 or weight>100 or weight<>round(weight,2) then
      raise exception 'Cada actividad necesita un nombre, un identificador único y un porcentaje mayor que 0, con hasta dos decimales' using errcode='22023';
    end if;
    ids:=array_append(ids,activity_id); total:=total+weight;
    cleaned:=cleaned||jsonb_build_array(jsonb_build_object('id',activity_id,'name',activity_name,'weight',weight));
  end loop;
  if total<>100 then raise exception 'Los porcentajes deben sumar exactamente 100 %%' using errcode='22023'; end if;
  insert into private.course_grade_schemes as existing(course_id,activities,reference_grade,revision)
    values(p_course_id,cleaned,p_reference_grade,1)
    on conflict(course_id) do update set activities=excluded.activities,reference_grade=excluded.reference_grade,
      revision=existing.revision+1,updated_at=now() returning * into g;
  return jsonb_build_object('activities',g.activities,'referenceGrade',g.reference_grade,'revision',g.revision,'updatedAt',g.updated_at);
end;
$$;

create function private.student_grade_calculator(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_student_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para usar la calculadora' using errcode='42501'; end if;
  perform private.assert_course_active(p_course_id);
  select s.id into v_student_id from public.students s where s.course_id=p_course_id
    and s.auth_user_id=(select auth.uid()) and s.phone is not null;
  if not found then raise exception 'Completa tu inscripción en esta materia' using errcode='42501'; end if;
  return jsonb_build_object(
    'scheme',(select jsonb_build_object('activities',g.activities,'referenceGrade',g.reference_grade,
      'revision',g.revision,'updatedAt',g.updated_at) from private.course_grade_schemes g where g.course_id=p_course_id),
    'draft',(select jsonb_build_object('grades',d.grades,'goal',d.goal,'schemeRevision',d.scheme_revision,
      'revision',d.revision,'updatedAt',d.updated_at) from private.student_grade_simulations d where d.student_id=v_student_id));
end;
$$;

create function private.student_save_grade_simulation(
  p_course_id uuid,p_scheme_revision integer,p_draft_revision integer,p_grades jsonb,p_goal numeric
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.courses%rowtype; s public.students%rowtype; g private.course_grade_schemes%rowtype;
  draft private.student_grade_simulations%rowtype; entry record; grade numeric;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para guardar tu simulación' using errcode='42501'; end if;
  -- Match teacher lock order; a save cannot use percentages being replaced.
  select * into c from public.courses where id=p_course_id for share;
  if not found or not c.active then raise exception 'Esta materia no está disponible' using errcode='42501'; end if;
  select * into s from public.students where course_id=p_course_id and auth_user_id=(select auth.uid())
    and phone is not null for update;
  if not found then raise exception 'Completa tu inscripción en esta materia' using errcode='42501'; end if;
  select * into g from private.course_grade_schemes where course_id=p_course_id for share;
  if not found or p_scheme_revision is null or p_scheme_revision<>g.revision then
    raise exception 'El docente actualizó los porcentajes. Recarga la calculadora y revisa el resultado.' using errcode='PT409';
  end if;
  select * into draft from private.student_grade_simulations where student_id=s.id for update;
  if p_draft_revision is null or p_draft_revision<>coalesce(draft.revision,0) then
    raise exception 'Tu simulación cambió en otro dispositivo. Recarga los datos antes de guardar.' using errcode='PT409';
  end if;
  if p_goal is null or p_goal not between 0 and 100 or p_goal<>round(p_goal,2) then
    raise exception 'La meta debe estar entre 0 y 100, con hasta dos decimales' using errcode='22023';
  end if;
  if p_grades is null or jsonb_typeof(p_grades)<>'object' or octet_length(p_grades::text)>8192 then
    raise exception 'Revisa las notas de tu simulación' using errcode='22023';
  end if;
  for entry in select key,value from jsonb_each(p_grades) loop
    if not exists(select 1 from jsonb_array_elements(g.activities) a where a->>'id'=entry.key)
      or jsonb_typeof(entry.value)<>'number' then
      raise exception 'Una nota no corresponde a las actividades actuales' using errcode='22023';
    end if;
    grade:=(entry.value#>>'{}')::numeric;
    if grade not between 0 and 100 or grade<>round(grade,2) then
      raise exception 'Cada nota debe estar entre 0 y 100, con hasta dos decimales' using errcode='22023';
    end if;
  end loop;
  insert into private.student_grade_simulations as existing(student_id,grades,goal,scheme_revision,revision)
    values(s.id,p_grades,p_goal,g.revision,1)
    on conflict(student_id) do update set grades=excluded.grades,goal=excluded.goal,scheme_revision=excluded.scheme_revision,
      revision=existing.revision+1,updated_at=now() returning * into draft;
  return jsonb_build_object('revision',draft.revision,'schemeRevision',draft.scheme_revision,'updatedAt',draft.updated_at);
end;
$$;

create function public.teacher_grade_scheme(p_course_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.teacher_grade_scheme(p_course_id); $$;
create function public.teacher_save_grade_scheme(p_course_id uuid,p_activities jsonb,p_reference_grade numeric,p_expected_revision integer)
returns jsonb language sql security invoker set search_path=''
as $$ select private.teacher_save_grade_scheme(p_course_id,p_activities,p_reference_grade,p_expected_revision); $$;
create function public.student_grade_calculator(p_course_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.student_grade_calculator(p_course_id); $$;
create function public.student_save_grade_simulation(p_course_id uuid,p_scheme_revision integer,p_draft_revision integer,p_grades jsonb,p_goal numeric)
returns jsonb language sql security invoker set search_path=''
as $$ select private.student_save_grade_simulation(p_course_id,p_scheme_revision,p_draft_revision,p_grades,p_goal); $$;

revoke all on function private.teacher_grade_scheme(uuid),private.teacher_save_grade_scheme(uuid,jsonb,numeric,integer),
  private.student_grade_calculator(uuid),private.student_save_grade_simulation(uuid,integer,integer,jsonb,numeric)
  from public,anon,authenticated;
revoke all on function public.teacher_grade_scheme(uuid),public.teacher_save_grade_scheme(uuid,jsonb,numeric,integer),
  public.student_grade_calculator(uuid),public.student_save_grade_simulation(uuid,integer,integer,jsonb,numeric)
  from public,anon,authenticated;
grant execute on function private.teacher_grade_scheme(uuid),private.teacher_save_grade_scheme(uuid,jsonb,numeric,integer),
  private.student_grade_calculator(uuid),private.student_save_grade_simulation(uuid,integer,integer,jsonb,numeric) to authenticated;
grant execute on function public.teacher_grade_scheme(uuid),public.teacher_save_grade_scheme(uuid,jsonb,numeric,integer),
  public.student_grade_calculator(uuid),public.student_save_grade_simulation(uuid,integer,integer,jsonb,numeric) to authenticated;
notify pgrst,'reload schema';
