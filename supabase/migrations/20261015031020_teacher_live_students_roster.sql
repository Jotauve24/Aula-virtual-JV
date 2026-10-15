-- The count and roster are derived from the same presence snapshot.
-- Only the authenticated owner of each course can receive its students.
-- No teacher/ZombieAdmin presence is included.
create or replace function public.teacher_live_course_counts()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.teachers t where t.user_id = (select auth.uid())
  ) then
    raise exception 'Acceso docente requerido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', c.id,
    'online_count', jsonb_array_length(presence.students),
    'students', presence.students,
    'observed_at', now()
  ) order by c.name), '[]'::jsonb)
  into v_result
  from public.courses c
  cross join lateral (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', trim(concat_ws(' ', s.first_name, s.last_name)),
        'group', coalesce(t.name, 'Sin equipo'),
        'seen_at', p.seen_at
      )
      order by s.first_name, s.last_name, s.id
    ), '[]'::jsonb) as students
    from private.classroom_presence p
    join public.students s on s.id = p.student_id and s.course_id = c.id
    left join public.topics t on t.id = s.topic_id and t.course_id = c.id
    where p.course_id = c.id
      and p.seen_at > now() - interval '15 seconds'
  ) presence
  where c.teacher_id = (select auth.uid()) and c.active;

  return v_result;
end;
$$;
revoke all on function public.teacher_live_course_counts() from public, anon;
grant execute on function public.teacher_live_course_counts() to authenticated;
