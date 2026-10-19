-- Applied in Supabase 20261019202916. Shared by all subjects; no student rows changed.
CREATE OR REPLACE FUNCTION public.student_has_any_enrollment()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select (select auth.uid()) is not null and
exists(select 1 from public.students s where s.auth_user_id=(select auth.uid()));
$function$;
revoke all on function public.student_has_any_enrollment() from public,anon;
grant execute on function public.student_has_any_enrollment() to authenticated;
