-- El código abre la materia; la sesión anónima distingue el navegador.
-- El correo declarado es solo contacto y no confiere identidad verificada.
alter table public.students drop constraint if exists students_course_id_email_key;
alter table public.students drop constraint if exists students_phone_check;
alter table public.students add constraint students_phone_check
  check (phone is null or (phone ~ '^\+?[0-9 -]{7,20}$'
    and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15));

create function public.enroll_student(p_code text, p_email text default null,
  p_first_name text default null, p_last_name text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course public.courses%rowtype; v_student public.students%rowtype;
  v_email text; v_phone text;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
  if p_code is null or char_length(p_code) > 48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses where code_hash =
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code, '[[:space:]]', '', 'g')), 'UTF8')), 'hex')
    for update;
  if not found then raise exception 'Materia no encontrada'; end if;
  select * into v_student from public.students
    where course_id = v_course.id and auth_user_id = (select auth.uid());
  if found then
    return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
  end if;
  if not v_course.registration_open then raise exception 'La inscripción está cerrada'; end if;
  if (select count(*) from public.students where course_id = v_course.id) >= 500 then
    raise exception 'La materia alcanzó el límite de estudiantes'; end if;
  v_email := lower(trim(p_email)); v_phone := trim(p_phone);
  if v_email is null or p_first_name is null or p_last_name is null or
     v_phone is null or char_length(v_email) not between 5 and 254 or
     v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' or
     char_length(trim(p_first_name)) not between 2 and 80 or
     char_length(trim(p_last_name)) not between 2 and 100 or
     v_phone !~ '^\+?[0-9 -]{7,20}$' or
     char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Revisa correo, nombre, apellido y teléfono';
  end if;
  insert into public.students(course_id, email, auth_user_id, original_first_name,
    original_last_name, first_name, last_name, phone, activated_at)
    values (v_course.id, v_email, (select auth.uid()), trim(p_first_name),
      trim(p_last_name), trim(p_first_name), trim(p_last_name), v_phone, now());
  return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
end;
$$;

create function public.save_student_avatar(p_course_id uuid, p_avatar jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_avatar) <> 'object' or
     p_avatar->>'skin' not in ('0','1','2') or
     p_avatar->>'shirt' not in ('0','1','2') or
     p_avatar->>'hair' not in ('short','long','curly') or
     pg_catalog.octet_length(p_avatar::text) > 256 then
    raise exception 'Revisa el avatar';
  end if;
  update public.students set avatar = p_avatar where course_id = p_course_id
    and auth_user_id = (select auth.uid());
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$$;

create or replace function public.course_room(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and phone is not null) and
     not exists (select 1 from public.courses where id = p_course_id
      and teacher_id = (select auth.uid())) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id;
  return v_result;
end;
$$;

create or replace function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_topic public.topics%rowtype;
begin
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección está cerrada'; end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id;
  if not found then raise exception 'Tema no encontrado'; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and topic_id is null and phone is not null;
  if not found then raise exception 'Revisa tu perfil o tu equipo actual'; end if;
end;
$$;

revoke all on function public.enroll_student(text,text,text,text,text),
  public.save_student_avatar(uuid,jsonb) from public, anon;
grant execute on function public.enroll_student(text,text,text,text,text),
  public.save_student_avatar(uuid,jsonb) to authenticated;
