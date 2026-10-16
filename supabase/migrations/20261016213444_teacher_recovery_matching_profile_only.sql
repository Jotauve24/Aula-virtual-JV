-- Same logic deployed to Supabase migration 20261016213444.
-- Shared by every course: preserves all students, avatars and existing requests.
CREATE OR REPLACE FUNCTION public.teacher_student_recovery_requests(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
  if not exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.teacher_id = (select auth.uid())
  ) then raise exception 'Acceso docente requerido'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'email',u.email,'requested_at',r.requested_at,
    'status',r.status
  ) order by r.requested_at), '[]'::jsonb)
  into v_data
  from private.student_recovery_requests r
  join auth.users u on u.id=r.requester_user_id
    and u.email_confirmed_at is not null
  where r.course_id=p_course_id and r.status='pending'
    -- Only show a review request when there is at least one course profile
    -- that could belong to the verified requester. A missing email match is
    -- not a recoverable claim in this inbox (and must not revive the panel).
    and exists (
      select 1 from public.students match
      where match.course_id=r.course_id
        and lower(btrim(match.email))=lower(btrim(u.email))
    )
    and not exists (
      select 1 from public.students owned
      where owned.course_id=r.course_id and owned.auth_user_id=u.id
    )
    -- Self-service eligible requests cannot require docente approval.
    and not (
      u.is_anonymous is false
      and not exists (select 1 from public.teachers t where t.user_id=u.id)
      and exists (select 1 from public.courses c where c.id=r.course_id and c.active)
      and (
        select count(*) from public.students s
        where s.course_id=r.course_id and lower(btrim(s.email))=lower(btrim(u.email))
      )=1
      and exists (
        select 1 from public.students s
        left join auth.users old_owner on old_owner.id=s.auth_user_id
        where s.course_id=r.course_id
          and lower(btrim(s.email))=lower(btrim(u.email))
          and (s.auth_user_id is null or old_owner.is_anonymous is true)
          and (
            s.auth_user_id is null or not exists (
              select 1 from private.classroom_presence p
              where p.course_id=s.course_id and p.student_id=s.id
                and p.seen_at>now()-interval '25 seconds'
            )
          )
      )
    );
  return v_data;
end;
$function$;
revoke all on function public.teacher_student_recovery_requests(uuid) from public,anon;
grant execute on function public.teacher_student_recovery_requests(uuid) to authenticated;
