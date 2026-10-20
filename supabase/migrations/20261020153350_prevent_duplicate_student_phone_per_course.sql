-- Compare local Panama numbers with their +507/00507 equivalents.
create or replace function private.registration_phone_key(p_phone text)
returns text language sql immutable strict set search_path to ''
as $function$
  select case
    when length(digits) in (12,13) and left(digits,5)='00507' then substr(digits,6)
    when length(digits) in (10,11) and left(digits,3)='507' then substr(digits,4)
    else nullif(digits,'')
  end
  from (select regexp_replace(p_phone,'[^0-9]','','g') as digits) normalized;
$function$;
revoke all on function private.registration_phone_key(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enroll_student(p_code text, p_email text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_course public.courses%rowtype; v_student public.students%rowtype;
  v_email text; v_phone text;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
  if p_code is null or char_length(p_code) > 48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses where code_hash =
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code, '[[:space:]]', '', 'g')), 'UTF8')), 'hex')
    and active for update;
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
  -- Enforced under the course FOR UPDATE lock above: duplicate registrations
  -- cannot race even when two browsers submit simultaneously.
  if exists (select 1 from public.students s
    where s.course_id=v_course.id and lower(btrim(s.email))=v_email) then
    raise exception 'Este correo ya tiene una inscripción en esta materia. Recupera tu cuenta anterior.';
  end if;
  -- The existing course row lock serializes competing registrations.
  if exists (select 1 from public.students s
    where s.course_id=v_course.id and
      private.registration_phone_key(s.phone)=private.registration_phone_key(v_phone)) then
    raise exception 'Este teléfono ya tiene una inscripción en esta materia. Recupera tu cuenta con el correo de tu registro anterior.';
  end if;
  insert into public.students(course_id, email, auth_user_id, original_first_name,
    original_last_name, first_name, last_name, phone, activated_at)
    values (v_course.id, v_email, (select auth.uid()), trim(p_first_name),
      trim(p_last_name), trim(p_first_name), trim(p_last_name), v_phone, now());
  return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
end;
$function$;

-- A name match keeps the hint from exposing other people's contact details.
create or replace function public.student_registration_phone_hint(
  p_code text,p_phone text,p_first_name text,p_last_name text)
returns boolean language plpgsql stable security definer set search_path to ''
as $function$
declare v_course uuid; v_phone text;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
  if p_code is null or char_length(p_code)>48
     or p_phone is null or char_length(p_phone)>20
     or p_first_name is null or char_length(p_first_name)>80
     or p_last_name is null or char_length(p_last_name)>100 then return false; end if;
  v_phone:=private.registration_phone_key(p_phone);
  if v_phone is null or char_length(v_phone) not between 7 and 15 then return false; end if;
  select id into v_course from public.courses
    where code_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code,'[[:space:]]','','g')),'UTF8')),'hex') and active;
  if not found then return false; end if;
  return exists(select 1 from public.students s
    where s.course_id=v_course
      and private.registration_phone_key(s.phone)=v_phone
      and lower(btrim(s.original_first_name))=lower(btrim(p_first_name))
      and lower(btrim(s.original_last_name))=lower(btrim(p_last_name))
      and s.auth_user_id is distinct from (select auth.uid()));
end;
$function$;
revoke all on function public.student_registration_phone_hint(text,text,text,text) from public,anon;
grant execute on function public.student_registration_phone_hint(text,text,text,text) to authenticated;
