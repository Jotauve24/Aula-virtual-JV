-- Count recent student heartbeats in each of the authenticated teacher's active courses.
-- Excludes the teacher/ZombieAdmin by reading only private.classroom_presence.
create function public.teacher_live_course_counts()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.teachers t where t.user_id = (select auth.uid())
  ) then
    raise exception 'Acceso docente requerido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', c.id,
    'online_count', active_students.online_count
  ) order by c.name), '[]'::jsonb)
  into v_result
  from public.courses c
  cross join lateral (
    select count(*)::integer as online_count
    from private.classroom_presence p
    join public.students s on s.id = p.student_id and s.course_id = c.id
    where p.course_id = c.id
      and p.seen_at > now() - interval '15 seconds'
  ) active_students
  where c.teacher_id = (select auth.uid()) and c.active;

  return v_result;
end;
$$;
revoke all on function public.teacher_live_course_counts() from public, anon;
grant execute on function public.teacher_live_course_counts() to authenticated;
