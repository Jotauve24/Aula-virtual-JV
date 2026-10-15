-- Self-service recovery is permitted ONLY for a unique contact email in one
-- requested course, verified by Supabase Auth, on an inactive anonymous account.
-- No student rows or existing requests are updated merely by installing this migration.
create function private.student_try_verified_email_recovery(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_student public.students%rowtype;
  v_old_owner auth.users%rowtype;
  v_matches integer;
  v_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión con un correo verificado';
  end if;
  select * into v_user from auth.users where id=(select auth.uid());
  if not found or coalesce(v_user.is_anonymous,true) or
    v_user.email_confirmed_at is null or v_user.email is null then
    raise exception 'Verifica primero tu correo electrónico';
  end if;
  if exists(select 1 from public.teachers where user_id=v_user.id) then
    raise exception 'Utiliza una cuenta estudiantil';
  end if;
  -- Serializes competing verified claimants for the same course.
  select * into v_course from public.courses where id=p_course_id and active for update;
  if not found then raise exception 'Materia no disponible'; end if;
  if exists(select 1 from public.students where course_id=v_course.id
    and auth_user_id=v_user.id) then
    return jsonb_build_object('status','active','course_id',v_course.id,
      'course_name',v_course.name);
  end if;
  v_email:=lower(btrim(v_user.email));
  select count(*) into v_matches from public.students
    where course_id=v_course.id and lower(btrim(email))=v_email;
  if v_matches=0 then
    return jsonb_build_object('status','not_found','course_name',v_course.name);
  elsif v_matches>1 then
    return jsonb_build_object('status','ambiguous','course_name',v_course.name);
  end if;
  select * into v_student from public.students
    where course_id=v_course.id and lower(btrim(email))=v_email for update;
  if v_student.auth_user_id is not null then
    select * into v_old_owner from auth.users where id=v_student.auth_user_id;
    if not found or not coalesce(v_old_owner.is_anonymous,false) then
      return jsonb_build_object('status','protected','course_name',v_course.name);
    end if;
    if exists(select 1 from private.classroom_presence p
      where p.student_id=v_student.id and p.course_id=v_course.id
        and p.seen_at>now()-interval '25 seconds') then
      return jsonb_build_object('status','in_use','course_name',v_course.name);
    end if;
  end if;
  update public.students set auth_user_id=v_user.id,activated_at=now()
    where id=v_student.id and course_id=v_course.id;
  update private.student_recovery_requests set status='approved',
    student_id=v_student.id, reviewed_at=now(), reviewed_by=null
    where course_id=v_course.id and requester_user_id=v_user.id
      and status='pending';
  return jsonb_build_object('status','recovered','course_id',v_course.id,
    'course_name',v_course.name);
end;
$$;
revoke all on function private.student_try_verified_email_recovery(uuid)
  from public, anon, authenticated;

-- Existing request button can immediately complete an eligible legacy claim.
create function public.student_complete_profile_recovery()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request record; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión primero'; end if;
  for v_request in
    select r.course_id
    from private.student_recovery_requests r
    join public.courses c on c.id=r.course_id and c.active
    where r.requester_user_id=(select auth.uid()) and r.status='pending'
    order by r.requested_at desc
    limit 10
  loop
    v_result:=private.student_try_verified_email_recovery(v_request.course_id);
    if v_result->>'status' in ('recovered','active') then return v_result; end if;
    if v_result->>'status'='in_use' then
      return jsonb_build_object('status','in_use');
    end if;
  end loop;
  return jsonb_build_object('status','pending');
end;
$$;
revoke all on function public.student_complete_profile_recovery()
  from public,anon;
grant execute on function public.student_complete_profile_recovery()
  to authenticated;

-- Preserve the original student request contract; auto-claim before entering
-- the teacher review queue, which remains the safe fallback for ambiguity.
create or replace function public.student_request_profile_recovery(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses%rowtype;
  v_user auth.users%rowtype;
  v_old private.student_recovery_requests%rowtype;
  v_auto jsonb;
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
  v_auto:=private.student_try_verified_email_recovery(v_course.id);
  if v_auto->>'status' in ('active','recovered','protected') then return v_auto; end if;
  select * into v_old from private.student_recovery_requests
    where course_id=v_course.id and requester_user_id=v_user.id for update;
  if found then
    if v_old.status='pending' then
      return jsonb_build_object('status','pending','reason',v_auto->>'status',
        'course_name',v_course.name);
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
  return jsonb_build_object('status','pending','reason',v_auto->>'status',
    'course_name',v_course.name);
end;
$$;
revoke all on function public.student_request_profile_recovery(text) from public,anon;
grant execute on function public.student_request_profile_recovery(text) to authenticated;
