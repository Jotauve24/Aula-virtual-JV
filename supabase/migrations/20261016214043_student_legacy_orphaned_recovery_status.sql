-- Deployed as Supabase migration 20261016214043.
-- Legacy unmatched requests are kept for audit but cannot create phantom docente reviews.
CREATE OR REPLACE FUNCTION public.student_complete_profile_recovery()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request record;
  v_result jsonb;
  v_any boolean := false;
  v_has_reviewable_candidate boolean := false;
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
    v_any:=true;
    v_result:=private.student_try_verified_email_recovery(v_request.course_id);
    if v_result->>'status' in ('recovered','active') then return v_result; end if;
    if v_result->>'status'='in_use' then
      return jsonb_build_object('status','in_use');
    end if;
    if v_result->>'status'<>'not_found' then
      v_has_reviewable_candidate:=true;
    end if;
  end loop;
  if v_any and not v_has_reviewable_candidate then
    return jsonb_build_object('status','not_found');
  end if;
  return jsonb_build_object('status','pending');
end;
$function$;
revoke all on function public.student_complete_profile_recovery() from public,anon;
grant execute on function public.student_complete_profile_recovery() to authenticated;
