-- The existing dashboard heartbeat also returns owner-only follow-up totals.
-- A grouped membership count preserves one row per topic, without multiplying totals.
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
    'ready_work_group_count', groups.ready_work_group_count,
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
      count(*) filter (where not t.work_group_created) as pending_work_group_count,
      count(*) filter (where not t.work_group_created and coalesce(members.used, 0) >= t.capacity) as ready_work_group_count
    from public.topics t
    left join (
      select s.topic_id, count(*) as used
      from public.students s
      where s.course_id = c.id and s.topic_id is not null
      group by s.topic_id
    ) members on members.topic_id = t.id
    where t.course_id = c.id and not t.archived
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

comment on function private.teacher_dashboard_snapshot() is
  'Owner-only dashboard. Ready work groups have reached capacity, remain unarchived and have no manual created check; over-capacity and locked groups follow the same rule.';
notify pgrst, 'reload schema';
