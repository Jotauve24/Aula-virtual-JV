-- The teacher is a separate actor: never enroll a teacher as a student or occupy a seat.
create table private.teacher_classroom_presence (
  course_id uuid primary key references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.teachers(user_id) on delete cascade,
  x integer not null check (x between 28 and 772),
  y integer not null check (y between 28 and 100000),
  direction text not null check (direction in ('up','down','left','right')),
  seen_at timestamptz not null default now()
);
alter table private.teacher_classroom_presence enable row level security;
revoke all on private.teacher_classroom_presence from public, anon, authenticated;

-- Only the actual owner of an active course may announce a teacher position
-- or read the recent positions of its enrolled students.
create function public.teacher_classroom_presence_ping(
  p_course_id uuid, p_x integer, p_y integer, p_direction text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_peers jsonb;
begin
  perform private.assert_course_active(p_course_id);
  if not exists (
    select 1 from public.courses c join public.teachers t on t.user_id = c.teacher_id
    where c.id = p_course_id and c.teacher_id = (select auth.uid())
  ) then raise exception 'Acceso docente requerido'; end if;
  if p_x not between 28 and 772 or p_y not between 28 and 100000
    or p_direction not in ('up','down','left','right') then
    raise exception 'Posición inválida';
  end if;

  insert into private.teacher_classroom_presence as presence
    (course_id,teacher_id,x,y,direction,seen_at)
    values (p_course_id,(select auth.uid()),p_x,p_y,p_direction,now())
    on conflict (course_id) do update set
      teacher_id = excluded.teacher_id,
      x = excluded.x, y = excluded.y, direction = excluded.direction,
      seen_at = excluded.seen_at;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', left(split_part(trim(s.first_name), ' ', 1),16),
    'avatar', s.avatar, 'x', presence.x, 'y', presence.y,
    'direction', presence.direction
  ) order by presence.seen_at desc), '[]'::jsonb)
  into v_peers
  from (
    select * from private.classroom_presence
    where course_id = p_course_id and seen_at > now() - interval '15 seconds'
    order by seen_at desc limit 60
  ) presence
  join public.students s on s.id = presence.student_id and s.course_id = p_course_id;

  return v_peers;
end;
$$;
revoke all on function public.teacher_classroom_presence_ping(uuid,integer,integer,text)
  from public,anon;
grant execute on function public.teacher_classroom_presence_ping(uuid,integer,integer,text)
  to authenticated;

create function public.teacher_classroom_presence_leave(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.teacher_classroom_presence p
  where p.course_id = p_course_id
    and p.teacher_id = (select auth.uid())
    and exists (
      select 1 from public.courses c
      where c.id = p_course_id and c.teacher_id = (select auth.uid())
    );
end;
$$;
revoke all on function public.teacher_classroom_presence_leave(uuid) from public,anon;
grant execute on function public.teacher_classroom_presence_leave(uuid) to authenticated;

-- Keep the existing student authentication and group privacy unchanged.
-- Append the teacher's short-lived presence, with no student profile or seat.
create or replace function public.classroom_presence_ping(
  p_course_id uuid, p_x integer, p_y integer, p_direction text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student_id uuid;
  v_peers jsonb;
  v_teacher jsonb;
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

  select jsonb_build_object(
    'id', 'teacher:' || t.teacher_id::text,
    'name', 'Jotauve', 'role', 'teacher',
    'avatar', jsonb_build_object('skin',1,'shirt',1,'outfit',0,'hair','short','presentation','hombre'),
    'x', t.x, 'y', t.y, 'direction', t.direction
  ) into v_teacher
  from private.teacher_classroom_presence t
  join public.courses c on c.id = t.course_id and c.teacher_id = t.teacher_id
  where t.course_id = p_course_id and t.seen_at > now() - interval '15 seconds';

  return v_peers || case when v_teacher is null then '[]'::jsonb
    else jsonb_build_array(v_teacher) end;
end;
$$;
revoke all on function public.classroom_presence_ping(uuid,integer,integer,text)
  from public,anon;
grant execute on function public.classroom_presence_ping(uuid,integer,integer,text)
  to authenticated;
