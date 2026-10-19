-- Applied in Supabase 20261019202728. Shared by all subjects; no student rows changed.
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
  insert into public.students(course_id, email, auth_user_id, original_first_name,
    original_last_name, first_name, last_name, phone, activated_at)
    values (v_course.id, v_email, (select auth.uid()), trim(p_first_name),
      trim(p_last_name), trim(p_first_name), trim(p_last_name), v_phone, now());
  return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
end;
$function$;
