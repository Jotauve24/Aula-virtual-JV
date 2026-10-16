-- Same logic deployed to Supabase migration 20261016213623.
-- Shared by every course: preserves all students, avatars and existing requests.
CREATE OR REPLACE FUNCTION public.student_request_profile_recovery(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Do not register a pending claim that has no corresponding student profile.
  -- The user receives a clear message and can correct their email or contact
  -- their teacher, without presenting an unrelated account for manual approval.
  if v_auto->>'status'='not_found' then
    return jsonb_build_object('status','not_found','course_name',v_course.name);
  end if;

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
$function$;
revoke all on function public.student_request_profile_recovery(text) from public,anon;
grant execute on function public.student_request_profile_recovery(text) to authenticated;
