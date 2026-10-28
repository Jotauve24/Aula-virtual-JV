-- The existing dashboard heartbeat also returns owner-only follow-up totals.
-- Aggregate topics/students separately: a joined roster must not multiply counts.
create or replace function private.teacher_dashboard_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.teachers t where t.user_id = (select auth.uid())
  ) then
    raise exception 'Acceso docente requerido' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', c.id,
    'online_count', jsonb_array_length(presence.students),
    'students', presence.students,
    'observed_at', now(),
    'student_count', roster.student_count,
    'topic_count', groups.topic_count,
    'pending_work_group_count', groups.pending_work_group_count,
    'enrollment_review_count', roster.enrollment_review_count
  ) order by c.name), '[]'::jsonb)
  into v_result
  from public.courses c
  cross join lateral (
    select count(*) as student_count,
      count(*) filter (where s.enrollment_review) as enrollment_review_count
    from public.students s where s.course_id = c.id
  ) roster
  cross join lateral (
    select count(*) as topic_count,
      count(*) filter (where not t.work_group_created) as pending_work_group_count
    from public.topics t where t.course_id = c.id and not t.archived
  ) groups
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', trim(concat_ws(' ', s.first_name, s.last_name)),
      'group', coalesce(t.name, 'Sin equipo'),
      'seen_at', p.seen_at
    ) order by s.first_name, s.last_name, s.id), '[]'::jsonb) as students
    from private.classroom_presence p
    join public.students s on s.id = p.student_id and s.course_id = c.id
    left join public.topics t on t.id = s.topic_id and t.course_id = c.id
    where p.course_id = c.id and p.seen_at > now() - interval '15 seconds'
  ) presence
  where c.teacher_id = (select auth.uid()) and c.active;
  return v_result;
end;
$$;
revoke all on function private.teacher_dashboard_snapshot() from public, anon;
grant execute on function private.teacher_dashboard_snapshot() to authenticated;

-- Keep the API name, return type and existing presence fields compatible.
create or replace function public.teacher_live_course_counts()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.teacher_dashboard_snapshot(); $$;
revoke all on function public.teacher_live_course_counts() from public, anon;
grant execute on function public.teacher_live_course_counts() to authenticated;
comment on function public.teacher_live_course_counts() is
  'Owner-only active-course presence, total students/groups, unchecked work groups and students marked for enrollment review. No student review metadata in the online roster.';
notify pgrst, 'reload schema';
