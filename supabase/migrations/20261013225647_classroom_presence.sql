-- A student's position is temporary. Only an enrolled student can announce a
-- position and see other active students in the same enabled course.
create table private.classroom_presence (
  student_id uuid primary key references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  x integer not null check (x between 28 and 772),
  y integer not null check (y between 28 and 100000),
  direction text not null check (direction in ('up', 'down', 'left', 'right')),
  seen_at timestamptz not null default now()
);

create index classroom_presence_course_seen_idx
  on private.classroom_presence (course_id, seen_at desc);

alter table private.classroom_presence enable row level security;
revoke all on private.classroom_presence from public, anon, authenticated;

create function public.classroom_presence_ping(
  p_course_id uuid, p_x integer, p_y integer, p_direction text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student_id uuid;
  v_peers jsonb;
begin
  perform private.assert_course_active(p_course_id);
  select s.id into v_student_id from public.students s
    where s.course_id = p_course_id and s.auth_user_id = (select auth.uid())
      and s.phone is not null;
  if v_student_id is null then raise exception 'No perteneces a esta materia'; end if;
  if p_x not between 28 and 772 or p_y not between 28 and 100000
    or p_direction not in ('up', 'down', 'left', 'right') then
    raise exception 'Posición inválida';
  end if;

  insert into private.classroom_presence as presence
    (student_id, course_id, x, y, direction, seen_at)
    values (v_student_id, p_course_id, p_x, p_y, p_direction, now())
    on conflict (student_id) do update set course_id = excluded.course_id,
      x = excluded.x, y = excluded.y, direction = excluded.direction,
      seen_at = excluded.seen_at;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', left(split_part(trim(s.first_name), ' ', 1), 16),
    'avatar', s.avatar, 'x', p.x, 'y', p.y, 'direction', p.direction
  ) order by p.seen_at desc), '[]'::jsonb) into v_peers
  from (
    select * from private.classroom_presence
      where course_id = p_course_id and student_id <> v_student_id
        and seen_at > now() - interval '15 seconds'
      order by seen_at desc limit 60
  ) p join public.students s on s.id = p.student_id and s.course_id = p_course_id;
  return v_peers;
end;
$$;

revoke all on function public.classroom_presence_ping(uuid, integer, integer, text)
  from public, anon;
grant execute on function public.classroom_presence_ping(uuid, integer, integer, text)
  to authenticated;
