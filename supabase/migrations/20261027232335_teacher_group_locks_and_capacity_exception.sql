-- Block voluntary team joins independently of occupancy. Existing memberships,
-- course codes, capacity and conversations are preserved.
alter table public.topics add column join_locked boolean not null default false;
comment on column public.topics.join_locked is 'Teacher closes voluntary joins; existing members and teacher assignments remain allowed.';

create or replace function private.set_topic_join_locked(p_course_id uuid, p_topic_id uuid, p_locked boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_course public.courses%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  select c.* into v_course from public.courses c
    where c.id=p_course_id and c.teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if not v_course.active then raise exception 'Restaura la materia antes de bloquear o abrir grupos'; end if;
  if p_locked is null then raise exception 'Indica si deseas bloquear o abrir el grupo' using errcode='22023'; end if;
  update public.topics set join_locked=p_locked
    where id=p_topic_id and course_id=p_course_id and not archived;
  if not found then raise exception 'Grupo no disponible'; end if;
  return jsonb_build_object('id',p_topic_id,'locked',p_locked);
end;
$$;
create or replace function public.teacher_set_topic_locked(p_course_id uuid, p_topic_id uuid, p_locked boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_topic_join_locked(p_course_id,p_topic_id,p_locked); $$;

create or replace function private.choose_open_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_course public.courses%rowtype; v_student public.students%rowtype; v_topic public.topics%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Perfil no encontrado' using errcode='42501'; end if;
  -- All joins, locks, teacher transfers and capacity edits serialize on the course.
  select c.* into v_course from public.courses c where c.id=p_course_id for update;
  if not found or not v_course.active then raise exception 'Materia deshabilitada'; end if;
  if not v_course.registration_open then raise exception 'La elección de equipos está cerrada'; end if;
  select s.* into v_student from public.students s
    where s.course_id=p_course_id and s.auth_user_id=(select auth.uid()) and s.phone is not null for update;
  if not found then raise exception 'Perfil no encontrado' using errcode='42501'; end if;
  if v_student.topic_id is not null then
    raise exception 'Ya perteneces a un equipo. Comuníquese con el docente por el mensajero de E-ducativa.';
  end if;
  select t.* into v_topic from public.topics t
    where t.id=p_topic_id and t.course_id=p_course_id and not t.archived for update;
  if not found then raise exception 'Tema no encontrado'; end if;
  if v_topic.join_locked then raise exception 'El docente bloqueó el ingreso a este equipo. Consulta con él para que te asigne un grupo.'; end if;
  if (select count(*) from public.students s where s.course_id=p_course_id and s.topic_id=p_topic_id)>=v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id=p_topic_id where id=v_student.id;
end;
$$;
create or replace function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.choose_open_topic(p_course_id,p_topic_id); $$;

create or replace function private.move_course_student(
  p_course_id uuid,p_student_id uuid,p_topic_id uuid,p_allow_over_capacity boolean
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_course public.courses%rowtype; v_student public.students%rowtype; v_topic public.topics%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  select c.* into v_course from public.courses c
    where c.id=p_course_id and c.teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if not v_course.active then raise exception 'Restaura la materia antes de cambiar estudiantes de grupo'; end if;
  select s.* into v_student from public.students s
    where s.id=p_student_id and s.course_id=p_course_id for update;
  if not found then raise exception 'El estudiante no pertenece a esta materia'; end if;
  select t.* into v_topic from public.topics t
    where t.id=p_topic_id and t.course_id=p_course_id and not t.archived for update;
  if not found then raise exception 'El grupo de destino no existe o está deshabilitado'; end if;
  if v_student.topic_id=v_topic.id then return; end if;
  if (select count(*) from public.students s where s.course_id=p_course_id and s.topic_id=v_topic.id)>=v_topic.capacity
     and p_allow_over_capacity is not true then
    raise exception 'El equipo está completo. Marca la autorización para superar el cupo e inténtalo de nuevo.';
  end if;
  -- Locked groups accept only the owner's explicit assignments.
  -- Only membership and the old team's voluntary phone-sharing permission change.
  update public.students set topic_id=v_topic.id,share_contact_with_team=false
    where id=v_student.id and course_id=p_course_id;
end;
$$;
-- Keep the existing bounded RPC for older clients, with no signature change.
create or replace function public.teacher_move_student(p_course_id uuid,p_student_id uuid,p_topic_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.move_course_student(p_course_id,p_student_id,p_topic_id,false); $$;
-- A separate, unambiguous RPC requires the current owner and an explicit flag.
create or replace function public.teacher_assign_student(
  p_course_id uuid,p_student_id uuid,p_topic_id uuid,p_allow_over_capacity boolean
) returns void language sql security invoker set search_path = ''
as $$ select private.move_course_student(p_course_id,p_student_id,p_topic_id,p_allow_over_capacity); $$;

create or replace function private.edit_topic(
  p_course_id uuid,p_topic_id uuid,p_name text,p_instructions text,p_capacity integer
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_topic public.topics%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  select t.* into v_topic from public.topics t
    where t.id=p_topic_id and t.course_id=p_course_id and not t.archived for update;
  if not found then raise exception 'Grupo no disponible'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 or
     p_instructions is null or char_length(p_instructions)>1000 or p_capacity is null or p_capacity not between 1 and 100 then
    raise exception 'Revisa el tema, las indicaciones y los cupos';
  end if;
  -- A teacher exception must not prevent later name/instruction edits.
  if p_capacity<>v_topic.capacity and p_capacity < (select count(*) from public.students where course_id=p_course_id and topic_id=p_topic_id) then
    raise exception 'Para cambiar los cupos, indica al menos la cantidad actual de integrantes';
  end if;
  update public.topics set name=trim(p_name),instructions=p_instructions,capacity=p_capacity
    where id=v_topic.id and course_id=p_course_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.course_room(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_topic_id uuid; v_teacher boolean;
begin
  perform private.assert_course_active(p_course_id);
  select topic_id into v_topic_id from public.students
    where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  select exists(select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) into v_teacher;
  if v_topic_id is null and not v_teacher and not exists
    (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and phone is not null) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position, 'locked', t.join_locked,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar,
      'email', case when t.id = v_topic_id then s.email else null end,
      'phone', case when t.id = v_topic_id and s.share_contact_with_team then s.phone else null end,
      'mine', s.auth_user_id = (select auth.uid()),
      'sharing', case when s.auth_user_id = (select auth.uid()) then s.share_contact_with_team else null end)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id and not t.archived;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.teacher_overview(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name,
      'registrationOpen', c.registration_open, 'active', c.active, 'accessCode', c.access_code),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position, 'locked', t.join_locked)
      order by t.position,t.id), '[]'::jsonb) from public.topics t where t.course_id = c.id and not t.archived),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id,
      'firstName', s.first_name, 'lastName', s.last_name, 'email', s.email,
      'phone', s.phone, 'nationalId', s.national_id, 'activated', s.activated_at is not null,
      'topicId', s.topic_id) order by s.last_name, s.first_name), '[]'::jsonb)
      from public.students s where s.course_id = c.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
      'email', u.email, 'claimedStudentId', r.claimed_student_id,
      'status', r.status) order by r.created_at), '[]'::jsonb)
      from public.claim_requests r join auth.users u on u.id = r.user_id
      where r.course_id = c.id)
    ) into v_result from public.courses c where c.id = p_course_id;
  return v_result;
end;
$function$;


revoke all on function private.set_topic_join_locked(uuid,uuid,boolean) from public,anon;
revoke all on function private.choose_open_topic(uuid,uuid) from public,anon;
revoke all on function private.move_course_student(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.teacher_set_topic_locked(uuid,uuid,boolean) from public,anon;
revoke all on function public.choose_topic(uuid,uuid) from public,anon;
revoke all on function public.teacher_move_student(uuid,uuid,uuid) from public,anon;
revoke all on function public.teacher_assign_student(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function private.set_topic_join_locked(uuid,uuid,boolean) to authenticated;
grant execute on function private.choose_open_topic(uuid,uuid) to authenticated;
grant execute on function private.move_course_student(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.teacher_set_topic_locked(uuid,uuid,boolean) to authenticated;
grant execute on function public.choose_topic(uuid,uuid) to authenticated;
grant execute on function public.teacher_move_student(uuid,uuid,uuid) to authenticated;
grant execute on function public.teacher_assign_student(uuid,uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
