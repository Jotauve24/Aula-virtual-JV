-- Flexible classrooms and private team attachments. Existing records are retained.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.topics add column archived boolean not null default false;
alter table public.topics add column position integer not null default 0;
with ranked as (select id, row_number() over (partition by course_id order by created_at,id) as n from public.topics)
update public.topics t set position = ranked.n from ranked where t.id = ranked.id;

create function private.resize_groups(p_course_id uuid, p_count integer, p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_remove uuid[]; v_position integer;
begin
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido'; end if;
  if p_count is null or p_count not between 1 and 40 or p_capacity is null or p_capacity not between 1 and 100 then
    raise exception 'Elige de 1 a 40 grupos y de 1 a 100 cupos por grupo'; end if;
  select count(*) into v_count from public.topics where course_id=p_course_id and not archived;
  if p_count < v_count then
    select array_agg(id) into v_remove from (
      select t.id from public.topics t where t.course_id=p_course_id and not t.archived
      and not exists(select 1 from public.students s where s.topic_id=t.id)
      order by t.position desc,t.id desc limit (v_count-p_count)) q;
    if coalesce(cardinality(v_remove),0) <> v_count-p_count then
      raise exception 'Hay grupos con integrantes. Libera sus lugares antes de reducir las mesas'; end if;
    update public.topics set archived=true where id=any(v_remove);
  elsif p_count > v_count then
    select coalesce(max(position),0) into v_position from public.topics where course_id=p_course_id;
    insert into public.topics(course_id,name,capacity,position)
    select p_course_id,'Grupo ' || (v_count+n),p_capacity,v_position+n from generate_series(1,p_count-v_count) n;
  end if;
end;
$$;
create function public.teacher_set_group_count(p_course_id uuid,p_count integer,p_capacity integer default 5)
returns void language sql security invoker set search_path = '' as $$
  select private.resize_groups(p_course_id,p_count,p_capacity);
$$;
create function public.create_course_with_groups(p_name text,p_code text,p_count integer,p_capacity integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  v_id := public.create_course(p_name,p_code);
  perform private.resize_groups(v_id,p_count,p_capacity);
  return v_id;
end;
$$;

create function private.edit_topic(p_course_id uuid,p_topic_id uuid,p_name text,p_instructions text,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 or
     p_instructions is null or char_length(p_instructions)>1000 or p_capacity is null or p_capacity not between 1 and 100 then
    raise exception 'Revisa el tema, las indicaciones y los cupos'; end if;
  if p_capacity < (select count(*) from public.students where course_id=p_course_id and topic_id=p_topic_id) then
    raise exception 'Los cupos no pueden ser menores que la cantidad de integrantes'; end if;
  update public.topics set name=trim(p_name),instructions=p_instructions,capacity=p_capacity
    where id=p_topic_id and course_id=p_course_id and not archived;
  if not found then raise exception 'Grupo no disponible'; end if;
end;
$$;
create function public.teacher_edit_topic(p_course_id uuid,p_topic_id uuid,p_name text,p_instructions text,p_capacity integer)
returns void language sql security invoker set search_path = '' as $$
  select private.edit_topic(p_course_id,p_topic_id,p_name,p_instructions,p_capacity);
$$;

alter table public.team_messages add column attachment_path text;
alter table public.team_messages add column attachment_name text;
alter table public.team_messages add column attachment_size bigint;
alter table public.team_messages add column attachment_type text;
alter table public.team_messages drop constraint team_messages_body_check;
alter table public.team_messages add constraint team_messages_body_check check (char_length(body) between 0 and 500);
alter table public.team_messages add constraint team_messages_content_check check (
  (attachment_path is null and char_length(trim(body))>0 and attachment_name is null and attachment_size is null and attachment_type is null)
  or (attachment_path is not null and attachment_name is not null and char_length(attachment_name) between 1 and 180
    and attachment_size between 1 and 10485760 and attachment_type is not null));
create unique index team_messages_attachment_path on public.team_messages(attachment_path) where attachment_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('team-attachments','team-attachments',false,10485760,array[
 'image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'application/zip']);

create function private.team_file_access(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and
    exists(select 1 from public.students s join public.topics t on t.id=s.topic_id
      where s.auth_user_id=(select auth.uid()) and s.phone is not null and not t.archived
      and s.course_id::text=split_part(p_path,'/',1) and s.topic_id::text=split_part(p_path,'/',2))
    and case when p_write then
      split_part(p_path,'/',3)=(select auth.uid())::text
      and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx|zip)$'
    else split_part(p_path,'/',3)=(select auth.uid())::text or
      exists(select 1 from public.team_messages m where m.attachment_path=p_path)
    end;
$$;
create function private.team_file_pending(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.team_file_access(p_path,true) and not exists
    (select 1 from public.team_messages where attachment_path=p_path);
$$;
create policy team_attachment_upload on storage.objects for insert to authenticated
with check (bucket_id='team-attachments' and private.team_file_access(name,true));
create policy team_attachment_read on storage.objects for select to authenticated
using (bucket_id='team-attachments' and private.team_file_access(name,false));
create policy team_attachment_cancel on storage.objects for delete to authenticated
using (bucket_id='team-attachments' and private.team_file_pending(name));

create function private.send_team_file(p_course_id uuid,p_topic_id uuid,p_body text,p_path text,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_student uuid; v_meta jsonb; v_body text := trim(coalesce(p_body,''));
begin
  select id into v_student from public.students where course_id=p_course_id and topic_id=p_topic_id
    and auth_user_id=(select auth.uid()) and phone is not null for update;
  if v_student is null or not coalesce(private.team_file_access(p_path,true),false)
    or split_part(p_path,'/',1)<>p_course_id::text or split_part(p_path,'/',2)<>p_topic_id::text then
    raise exception 'Solo tu equipo puede compartir este adjunto'; end if;
  if p_name is null or char_length(p_name) not between 1 and 180 or p_name ~ '[[:cntrl:]]' or char_length(v_body)>500 then
    raise exception 'Revisa el nombre del archivo y el mensaje'; end if;
  if exists(select 1 from public.team_messages where attachment_path=p_path and student_id=v_student) then return; end if;
  select metadata into v_meta from storage.objects where bucket_id='team-attachments' and name=p_path;
  if not found or coalesce((v_meta->>'size')::bigint,0) not between 1 and 10485760 then
    raise exception 'El archivo no terminó de subirse o supera los 10 MB'; end if;
  if exists(select 1 from public.team_messages where student_id=v_student and created_at>now()-interval '3 seconds') then
    raise exception 'Espera unos segundos antes de enviar otro mensaje'; end if;
  insert into public.team_messages(course_id,topic_id,student_id,body,attachment_path,attachment_name,attachment_size,attachment_type)
    values(p_course_id,p_topic_id,v_student,v_body,p_path,p_name,(v_meta->>'size')::bigint,v_meta->>'mimetype');
end;
$$;
create function public.team_chat_send_file(p_course_id uuid,p_topic_id uuid,p_body text,p_path text,p_name text)
returns void language sql security invoker set search_path = '' as $$
  select private.send_team_file(p_course_id,p_topic_id,p_body,p_path,p_name);
$$;

revoke all on function private.resize_groups(uuid,integer,integer),private.edit_topic(uuid,uuid,text,text,integer),
 private.team_file_access(text,boolean),private.team_file_pending(text),private.send_team_file(uuid,uuid,text,text,text),
 public.teacher_set_group_count(uuid,integer,integer),public.create_course_with_groups(text,text,integer,integer),
 public.teacher_edit_topic(uuid,uuid,text,text,integer),public.team_chat_send_file(uuid,uuid,text,text,text) from public,anon;
grant execute on function private.resize_groups(uuid,integer,integer),private.edit_topic(uuid,uuid,text,text,integer),
 private.team_file_access(text,boolean),private.team_file_pending(text),private.send_team_file(uuid,uuid,text,text,text),
 public.teacher_set_group_count(uuid,integer,integer),public.create_course_with_groups(text,text,integer,integer),
 public.teacher_edit_topic(uuid,uuid,text,text,integer),public.team_chat_send_file(uuid,uuid,text,text,text) to authenticated;

create or replace function public.my_courses()
returns table (id uuid, name text, registration_open boolean,
               student_count bigint, topic_count bigint)
language sql security definer set search_path = '' as $$
  select c.id, c.name, c.registration_open,
    (select count(*) from public.students s where s.course_id = c.id),
    (select count(*) from public.topics t where t.course_id = c.id and not t.archived)
  from public.courses c where c.teacher_id = (select auth.uid())
  order by c.created_at desc;
$$;
create or replace function public.teacher_overview(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name,
      'registrationOpen', c.registration_open),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position)
      order by t.position,t.id), '[]'::jsonb) from public.topics t where t.course_id = c.id and not t.archived),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id,
      'firstName', s.first_name, 'lastName', s.last_name, 'email', s.email,
      'phone', s.phone, 'nationalId', s.national_id, 'activated', s.activated_at is not null,
      'topicId', s.topic_id) order by s.last_name, s.first_name), '[]'::jsonb)
      from public.students s where s.course_id = c.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
      'email', u.email, 'claimedStudentId', r.claimed_student_id,
      'status', r.status) order by r.created_at), '[]'::jsonb)
      from public.claim_requests r join auth.users u on u.id = r.user_id
      where r.course_id = c.id)
    ) into v_result from public.courses c where c.id = p_course_id;
  return v_result;
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
    'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar,
      'email', case when t.id = v_topic_id and s.share_contact_with_team then s.email else null end,
      'phone', case when t.id = v_topic_id and s.share_contact_with_team then s.phone else null end,
      'mine', s.auth_user_id = (select auth.uid()),
      'sharing', case when s.auth_user_id = (select auth.uid()) then s.share_contact_with_team else null end)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id and not t.archived;
  return v_result;
end;
$$;
create or replace function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_topic public.topics%rowtype; v_student public.students%rowtype;
begin
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección de equipos está cerrada'; end if;
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and phone is not null for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  if v_student.topic_id is not null then
    raise exception 'Ya perteneces a un equipo. Comuníquese con el docente por el mensajero de E-ducativa.';
  end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id and not archived;
  if not found then raise exception 'Tema no encontrado'; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id where id = v_student.id;
end;
$$;
create or replace function public.team_chat_read(p_course_id uuid, p_topic_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid; v_messages jsonb;
begin
  select id into v_student_id from public.students
  where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = (select auth.uid()) and phone is not null;
  if v_student_id is null then raise exception 'Solo tu equipo puede leer esta conversación'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', s.first_name || ' ' || s.last_name,
    'body', m.body, 'senderId', s.id, 'attachment', case when m.attachment_path is not null then jsonb_build_object('path',m.attachment_path,'name',m.attachment_name,'size',m.attachment_size,'type',m.attachment_type) else null end, 'mine', m.student_id = v_student_id, 'createdAt', m.created_at)
    order by m.id), '[]'::jsonb) into v_messages
  from (select * from public.team_messages where course_id = p_course_id
    and topic_id = p_topic_id order by id desc limit 50) m
  join public.students s on s.id = m.student_id;
  return v_messages;
end;
$$;
create or replace function public.teacher_add_topic(p_course_id uuid, p_name text,
  p_instructions text, p_capacity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso denegado'; end if;
  if (select count(*) from public.topics where course_id=p_course_id and not archived)>=40 then raise exception 'El aula admite hasta 40 grupos'; end if;
  if char_length(trim(p_name)) not between 2 and 80 or
    char_length(p_instructions) > 1000 or p_capacity not between 1 and 100 then
    raise exception 'Revisa el tema y el cupo';
  end if;
  insert into public.topics(course_id,name,instructions,capacity,position)
    values (p_course_id,trim(p_name),coalesce(p_instructions,''),p_capacity,(select coalesce(max(position),0)+1 from public.topics where course_id=p_course_id))
    returning id into v_id;
  return v_id;
end;
$$;
