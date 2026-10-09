-- Conversación privada para integrantes del mismo tema.
alter table public.students add column share_contact_with_team boolean not null default false;

create function public.team_contact_setting(p_course_id uuid, p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.students set share_contact_with_team = coalesce(p_share, false)
  where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$$;

create or replace function public.course_room(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_topic_id uuid; v_teacher boolean;
begin
  select topic_id into v_topic_id from public.students
    where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  select exists(select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) into v_teacher;
  if v_topic_id is null and not v_teacher and not exists
    (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and phone is not null) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar,
      'email', case when t.id = v_topic_id and s.share_contact_with_team then s.email else null end,
      'phone', case when t.id = v_topic_id and s.share_contact_with_team then s.phone else null end,
      'mine', s.auth_user_id = (select auth.uid()),
      'sharing', case when s.auth_user_id = (select auth.uid()) then s.share_contact_with_team else null end)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id;
  return v_result;
end;
$$;

create table public.team_messages (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (topic_id, course_id) references public.topics(id, course_id) on delete cascade
);
create index team_messages_topic_recent on public.team_messages(topic_id, id desc);
alter table public.team_messages enable row level security;
revoke all on public.team_messages from public, anon, authenticated;

create function public.team_chat_read(p_course_id uuid, p_topic_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid; v_messages jsonb;
begin
  select id into v_student_id from public.students
  where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = (select auth.uid()) and phone is not null;
  if v_student_id is null then raise exception 'Solo tu equipo puede leer esta conversación'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', s.first_name || ' ' || s.last_name,
    'body', m.body, 'mine', m.student_id = v_student_id, 'createdAt', m.created_at)
    order by m.id), '[]'::jsonb) into v_messages
  from (select * from public.team_messages where course_id = p_course_id
    and topic_id = p_topic_id order by id desc limit 50) m
  join public.students s on s.id = m.student_id;
  return v_messages;
end;
$$;

create function public.team_chat_send(p_course_id uuid, p_topic_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid; v_body text := trim(p_body);
begin
  select id into v_student_id from public.students
  where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = (select auth.uid()) and phone is not null;
  if v_student_id is null then raise exception 'Solo tu equipo puede escribir aquí'; end if;
  if v_body is null or char_length(v_body) not between 1 and 500 then
    raise exception 'Escribe un mensaje de hasta 500 caracteres'; end if;
  if exists (select 1 from public.team_messages where student_id = v_student_id
    and created_at > now() - interval '3 seconds') then
    raise exception 'Espera unos segundos antes de escribir otra vez'; end if;
  insert into public.team_messages(course_id, topic_id, student_id, body)
    values (p_course_id, p_topic_id, v_student_id, v_body);
end;
$$;

revoke all on function public.team_chat_read(uuid,uuid),
  public.team_chat_send(uuid,uuid,text), public.team_contact_setting(uuid,boolean) from public, anon;
grant execute on function public.team_chat_read(uuid,uuid),
  public.team_chat_send(uuid,uuid,text), public.team_contact_setting(uuid,boolean) to authenticated;
