-- Codes remain visible only to the teacher who owns the course.
-- Old hashes cannot be reversed; no existing code is changed by this migration.
alter table public.courses add column access_code text;
alter table public.courses add constraint courses_access_code_check check (
  access_code is null or (access_code ~ '^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$'
    and code_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(access_code,'UTF8')),'hex')));

create or replace function public.create_course(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.teachers where user_id = (select auth.uid())) then
    raise exception 'Acceso docente requerido';
  end if;
  if p_name is null or p_code is null or char_length(trim(p_name)) not between 2 and 120 or
     p_code !~ '^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$' then
    raise exception 'Nombre o código inválido';
  end if;
  insert into public.courses(teacher_id, name, access_code, code_hash)
    values ((select auth.uid()), trim(p_name), p_code,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(upper(trim(p_code)), 'UTF8')), 'hex'))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.teacher_overview(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name,
      'registrationOpen', c.registration_open, 'accessCode', c.access_code),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position)
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
$$;
create function private.generate_missing_course_code(p_course_id uuid,p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  select access_code into v_code from public.courses
    where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido'; end if;
  -- A retry or a second tab must return the saved code, never rotate it again.
  if v_code is not null then return v_code; end if;
  if p_code is null or p_code !~ '^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$' then
    raise exception 'Código inválido'; end if;
  update public.courses set access_code=p_code,
    code_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code,'UTF8')),'hex')
    where id=p_course_id;
  return p_code;
end;
$$;
create function public.teacher_generate_course_code(p_course_id uuid,p_code text)
returns text language sql security invoker set search_path = '' as $$
  select private.generate_missing_course_code(p_course_id,p_code);
$$;
revoke all on function private.generate_missing_course_code(uuid,text),
  public.teacher_generate_course_code(uuid,text) from public,anon;
grant execute on function private.generate_missing_course_code(uuid,text),
  public.teacher_generate_course_code(uuid,text) to authenticated;
