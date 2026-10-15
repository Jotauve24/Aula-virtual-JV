-- Opt-in recovery: NO existing student row, team, avatar or message is rewritten.
-- A verified email may request a legacy profile, but ONLY its course owner approves transfer.
create table private.student_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  student_id uuid references public.students(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(course_id, requester_user_id)
);
create index student_recovery_pending_by_course on private.student_recovery_requests(course_id,requested_at) where status='pending';
alter table private.student_recovery_requests enable row level security;
revoke all on private.student_recovery_requests from public, anon, authenticated;

-- Permanent/anonymous account holders can discover only courses they actually own.
create function public.student_owned_courses()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', c.id, 'course_name', c.name, 'topic_id', s.topic_id)
    order by c.name), '[]'::jsonb)
  from public.students s join public.courses c on c.id=s.course_id
  where s.auth_user_id=(select auth.uid()) and c.active;
$$;
revoke all on function public.student_owned_courses() from public,anon;
grant execute on function public.student_owned_courses() to authenticated;

-- Opens an already-owned course without knowing the shared registration code.
create function public.student_open_owned_course(p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_name text;
begin
  select c.name into v_name
  from public.students s join public.courses c on c.id=s.course_id
  where c.id=p_course_id and s.auth_user_id=(select auth.uid()) and c.active;
  if v_name is null then raise exception 'No perteneces a esta materia'; end if;
  return jsonb_build_object('course_id', p_course_id,'course_name', v_name);
end;
$$;
revoke all on function public.student_open_owned_course(uuid) from public,anon;
grant execute on function public.student_open_owned_course(uuid) to authenticated;

create function public.student_request_profile_recovery(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course public.courses%rowtype; v_user auth.users%rowtype; v_old private.student_recovery_requests%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión con un correo verificado'; end if;
  select * into v_user from auth.users where id=(select auth.uid());
  if v_user.is_anonymous or v_user.email_confirmed_at is null or v_user.email is null then
    raise exception 'Verifica primero el correo de tu cuenta';
  end if;
  if exists(select 1 from public.teachers where user_id=v_user.id) then
    raise exception 'Utiliza una cuenta estudiantil';
  end if;
  if p_code is null or char_length(p_code)>48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses
  where code_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    upper(regexp_replace(p_code,'[[:space:]]','','g')),'UTF8')),'hex') and active;
  if not found then raise exception 'Materia no encontrada'; end if;
  if exists(select 1 from public.students where course_id=v_course.id and auth_user_id=v_user.id) then
    return jsonb_build_object('status','active','course_id',v_course.id,'course_name',v_course.name);
  end if;
  select * into v_old from private.student_recovery_requests
    where course_id=v_course.id and requester_user_id=v_user.id for update;
  if found then
    if v_old.status='pending' then
      return jsonb_build_object('status','pending','course_name',v_course.name);
    end if;
    if v_old.requested_at>now()-interval '10 minutes' then
      return jsonb_build_object('status',v_old.status,'course_name',v_course.name);
    end if;
    update private.student_recovery_requests set status='pending',student_id=null,
      reviewed_by=null,reviewed_at=null,requested_at=now() where id=v_old.id;
  else
    insert into private.student_recovery_requests(course_id,requester_user_id)
      values (v_course.id,v_user.id);
  end if;
  return jsonb_build_object('status','pending','course_name',v_course.name);
end;
$$;
revoke all on function public.student_request_profile_recovery(text) from public,anon;
grant execute on function public.student_request_profile_recovery(text) to authenticated;

-- Only the owning teacher sees verified requesters.
create function public.teacher_student_recovery_requests(p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_data jsonb;
begin
  if not exists(select 1 from public.courses c
    where c.id=p_course_id and c.teacher_id=(select auth.uid())) then
    raise exception 'Acceso docente requerido';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'email',u.email,'requested_at',r.requested_at,'status',r.status)
    order by r.requested_at), '[]'::jsonb)
  into v_data from private.student_recovery_requests r
  join auth.users u on u.id=r.requester_user_id and u.email_confirmed_at is not null
  where r.course_id=p_course_id and r.status='pending';
  return v_data;
end;
$$;
revoke all on function public.teacher_student_recovery_requests(uuid) from public,anon;
grant execute on function public.teacher_student_recovery_requests(uuid) to authenticated;

-- The selected legacy profile is transferred atomically WITHOUT replacing its id.
-- Preserve topic, avatar, existing chat messages, files and contact as recorded.
create function public.teacher_decide_student_recovery(
  p_request_id uuid,p_student_id uuid,p_expected_name text,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request private.student_recovery_requests%rowtype;
  v_student public.students%rowtype; v_user auth.users%rowtype;
  v_owner auth.users%rowtype;
begin
  select r.* into v_request from private.student_recovery_requests r
    join public.courses c on c.id=r.course_id
    where r.id=p_request_id and c.teacher_id=(select auth.uid()) and c.active
    for update of r;
  if not found or v_request.status<>'pending' then raise exception 'Solicitud no disponible'; end if;
  select * into v_user from auth.users where id=v_request.requester_user_id;
  if v_user.is_anonymous or v_user.email_confirmed_at is null then
    raise exception 'La cuenta solicitante no tiene un correo verificado';
  end if;
  if not p_approve then
    update private.student_recovery_requests set status='rejected',reviewed_by=(select auth.uid()),
      reviewed_at=now() where id=v_request.id;
    return;
  end if;
  select * into v_student from public.students
    where id=p_student_id and course_id=v_request.course_id for update;
  if not found or lower(trim(concat_ws(' ',v_student.first_name,v_student.last_name))) <>
    lower(trim(coalesce(p_expected_name,''))) then
    raise exception 'Comprueba el estudiante seleccionado';
  end if;
  if exists(select 1 from public.students
    where course_id=v_request.course_id and auth_user_id=v_user.id) then
    raise exception 'Esta cuenta ya tiene un perfil en la materia';
  end if;
  if v_student.auth_user_id is not null then
    select * into v_owner from auth.users where id=v_student.auth_user_id;
    if not v_owner.is_anonymous then
      raise exception 'Este perfil ya tiene una identidad permanente';
    end if;
    if exists(select 1 from private.classroom_presence p
      where p.student_id=v_student.id and p.seen_at>now()-interval '20 seconds') then
      raise exception 'El estudiante todavía está en el aula. Pídele que salga antes de recuperar la cuenta';
    end if;
  end if;
  update public.students set auth_user_id=v_user.id,activated_at=now()
    where id=v_student.id;
  update private.student_recovery_requests set status='approved',student_id=v_student.id,
    reviewed_by=(select auth.uid()),reviewed_at=now() where id=v_request.id;
end;
$$;
revoke all on function public.teacher_decide_student_recovery(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.teacher_decide_student_recovery(uuid,uuid,text,boolean) to authenticated;
