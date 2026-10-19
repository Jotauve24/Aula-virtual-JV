-- Applied in Supabase 20261019202818. Shared by all subjects; no student rows changed.
CREATE OR REPLACE FUNCTION public.student_registration_email_hint(p_code text, p_email text, p_first_name text, p_last_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_course uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida';
  end if;
  if p_code is null or char_length(p_code)>48
     or p_email is null or char_length(p_email)>254
     or p_first_name is null or char_length(p_first_name)>80
     or p_last_name is null or char_length(p_last_name)>100 then
    return false;
  end if;
  select id into v_course from public.courses
   where code_hash=pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(upper(regexp_replace(p_code,'[[:space:]]','','g')),'UTF8')),'hex')
     and active;
  if not found then return false; end if;
  return exists(
    select 1 from public.students s
    where s.course_id=v_course
      and lower(btrim(s.email))=lower(btrim(p_email))
      and lower(btrim(s.original_first_name))=lower(btrim(p_first_name))
      and lower(btrim(s.original_last_name))=lower(btrim(p_last_name))
  );
end;
$function$;
revoke all on function public.student_registration_email_hint(text,text,text,text) from public,anon;
grant execute on function public.student_registration_email_hint(text,text,text,text) to authenticated;
