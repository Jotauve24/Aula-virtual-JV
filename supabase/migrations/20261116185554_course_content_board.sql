-- A course mural, isolated from team chat and private grade simulations.
create table private.course_board_settings (
  course_id uuid primary key references public.courses(id) on delete cascade,
  instructions text not null default '' check (char_length(instructions)<=4000),
  posting_open boolean not null default true,
  revision integer not null check (revision>0),
  updated_at timestamptz not null default now()
);
create table private.course_board_posts (
  id uuid primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  author_user_id uuid,
  author_student_id uuid references public.students(id) on delete set null,
  author_is_teacher boolean not null,
  author_name text not null check (char_length(author_name) between 1 and 200),
  topic_id uuid references public.topics(id) on delete set null,
  topic_name text not null default '',
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body)<=3000),
  kind text not null check (kind in ('note','infographic','document','presentation','book','video','link')),
  url text not null default '' check (char_length(url)<=2000),
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_type text,
  pinned boolean not null default false,
  state text not null default 'visible' check (state in ('visible','hidden','removed')),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_attachment_complete check ((attachment_path is null and attachment_name is null and attachment_size is null and attachment_type is null)
    or (attachment_path is not null and char_length(attachment_name) between 1 and 180 and attachment_size between 1 and 10485760 and attachment_type is not null))
);
create index course_board_posts_course_order on private.course_board_posts(course_id,pinned desc,created_at desc,id desc);
create index course_board_posts_author on private.course_board_posts(author_student_id) where author_student_id is not null;
create index course_board_posts_topic on private.course_board_posts(topic_id) where topic_id is not null;
create index course_board_posts_user_time on private.course_board_posts(course_id,author_user_id,created_at desc);
create unique index course_board_posts_file on private.course_board_posts(attachment_path) where attachment_path is not null;
alter table private.course_board_settings enable row level security;
alter table private.course_board_posts enable row level security;
revoke all on private.course_board_settings,private.course_board_posts from public,anon,authenticated,service_role;
create policy board_settings_rpc_only on private.course_board_settings for all to anon,authenticated using(false) with check(false);
create policy board_posts_rpc_only on private.course_board_posts for all to anon,authenticated using(false) with check(false);

create function private.board_actor(p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; s public.students%rowtype; uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Inicia sesión para abrir el tablero' using errcode='42501'; end if;
  select * into c from public.courses where id=p_course_id and active;
  if not found then raise exception 'La materia no está disponible' using errcode='42501'; end if;
  if c.teacher_id=uid then return jsonb_build_object('isTeacher',true,'studentId',null,'name','Docente','topicId',null); end if;
  select * into s from public.students where course_id=p_course_id and auth_user_id=uid and phone is not null;
  if not found then raise exception 'No perteneces a esta materia o falta completar tu registro' using errcode='42501'; end if;
  return jsonb_build_object('isTeacher',false,'studentId',s.id,'name',s.first_name||' '||s.last_name,'topicId',s.topic_id);
end $$;

create function private.board_post_json(p private.course_board_posts,a jsonb)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'body',p.body,'kind',p.kind,'url',p.url,
    'authorName',p.author_name,'authorIsTeacher',p.author_is_teacher,'topicId',p.topic_id,
    'topicName',coalesce((select t.name from public.topics t where t.id=p.topic_id),p.topic_name),
    'mine',case when p.author_is_teacher then coalesce((a->>'isTeacher')::boolean,false) and p.author_user_id=(select auth.uid())
      else p.author_student_id=(a->>'studentId')::uuid end,
    'pinned',p.pinned,'state',p.state,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
    'attachment',case when p.attachment_path is null then null else jsonb_build_object('path',p.attachment_path,
      'name',p.attachment_name,'size',p.attachment_size,'type',p.attachment_type) end);
$$;

create function private.course_board(p_course_id uuid,p_kind text,p_scope text,p_topic_id uuid,p_search text,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb:=private.board_actor(p_course_id); settings jsonb; posts jsonb; total bigint; groups jsonb;
  teacher boolean:=coalesce((a->>'isTeacher')::boolean,false); sid uuid:=(a->>'studentId')::uuid;
begin
  if p_kind is null or p_kind not in ('','note','infographic','document','presentation','book','video','link')
    or p_scope is null or p_scope not in ('all','mine','hidden') or p_search is null or char_length(p_search)>120
    or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 48 then
    raise exception 'Revisa los filtros del tablero' using errcode='22023'; end if;
  select jsonb_build_object('instructions',g.instructions,'postingOpen',g.posting_open,'revision',g.revision)
    into settings from private.course_board_settings g where g.course_id=p_course_id;
  settings:=coalesce(settings,jsonb_build_object('instructions','','postingOpen',true,'revision',0));
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.position,t.id),'[]') into groups
    from public.topics t where t.course_id=p_course_id and not t.archived;
  with filtered as (
    select p.* from private.course_board_posts p where p.course_id=p_course_id
      and (p.state='visible' or teacher or p.author_student_id=sid)
      and case p_scope when 'hidden' then p.state<>'visible' when 'mine' then
        case when teacher then p.author_is_teacher and p.author_user_id=(select auth.uid()) else p.author_student_id=sid end
        else p.state='visible' end
      and (p_kind='' or p.kind=p_kind) and (p_topic_id is null or p.topic_id=p_topic_id)
      and (p_search='' or strpos(lower(p.title||' '||p.body||' '||p.author_name),lower(p_search))>0)
  ), paged as (select * from filtered order by pinned desc,created_at desc,id desc offset p_offset limit p_limit)
  select (select count(*) from filtered),coalesce((select jsonb_agg(private.board_post_json(p::private.course_board_posts,a) order by p.pinned desc,p.created_at desc,p.id desc) from paged p),'[]')
    into total,posts;
  return jsonb_build_object('actor',a,'settings',settings,'groups',groups,'posts',posts,'total',total,
    'hasMore',p_offset+jsonb_array_length(posts)<total,'nextOffset',p_offset+jsonb_array_length(posts));
end $$;

create function private.board_mime(p_extension text)
returns text language sql immutable set search_path='' as $$
  select case lower(p_extension)
    when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' when 'gif' then 'image/gif'
    when 'pdf' then 'application/pdf' when 'txt' then 'text/plain' when 'csv' then 'text/csv' when 'doc' then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls' then 'application/vnd.ms-excel' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'ppt' then 'application/vnd.ms-powerpoint' when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    when 'zip' then 'application/zip' else null end;
$$;

-- A separate board/ namespace in the existing private bucket preserves the
-- teacher's existing course-file manifest, physical cleanup and deletion guard.
create function private.board_file_access(p_path text,p_mode text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a jsonb; c uuid; uid uuid:=(select auth.uid());
begin
  if uid is null or p_path is null or p_mode is null or p_mode not in ('upload','read','cancel') or
    p_path !~ '^[0-9a-f-]{36}/board/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx|zip)$' then return false; end if;
  begin c:=split_part(p_path,'/',1)::uuid; a:=private.board_actor(c);
    exception when insufficient_privilege or invalid_text_representation then return false; end;
  if p_mode='read' then return
    (split_part(p_path,'/',3)=uid::text and not exists(select 1 from private.course_board_posts where attachment_path=p_path))
    or exists(select 1 from private.course_board_posts p where p.course_id=c and p.attachment_path=p_path
      and (p.state='visible' or (a->>'isTeacher')::boolean or p.author_student_id=(a->>'studentId')::uuid)); end if;
  if split_part(p_path,'/',3)<>uid::text then return false; end if;
  if exists(select 1 from private.course_board_posts where attachment_path=p_path) then return false; end if;
  if p_mode='cancel' then return true; end if;
  return coalesce((a->>'isTeacher')::boolean,false) or coalesce((select posting_open from private.course_board_settings where course_id=c),true);
end $$;
create policy board_attachment_upload on storage.objects for insert to authenticated
  with check(bucket_id='team-attachments' and private.board_file_access(name,'upload'));
create policy board_attachment_read on storage.objects for select to authenticated
  using(bucket_id='team-attachments' and private.board_file_access(name,'read'));
create policy board_attachment_cancel on storage.objects for delete to authenticated
  using(bucket_id='team-attachments' and private.board_file_access(name,'cancel'));

create function private.course_board_save_post(p_course_id uuid,p_post_id uuid,p_expected_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; old private.course_board_posts%rowtype; saved private.course_board_posts%rowtype;
  teacher boolean; mine boolean; v_title text; v_body text; v_kind text; v_url text; v_path text; v_name text;
  v_size bigint; v_type text; meta jsonb; v_topic uuid; v_topic_name text;
begin
  perform 1 from public.courses where id=p_course_id and active for share;
  a:=private.board_actor(p_course_id); teacher:=(a->>'isTeacher')::boolean;
  if not teacher and not coalesce((select posting_open from private.course_board_settings where course_id=p_course_id),true) then
    raise exception 'El docente cerró las publicaciones del tablero. Puedes seguir consultándolo.' using errcode='42501'; end if;
  if p_post_id is null or p_expected_revision is null or p_expected_revision<0 or p_data is null or jsonb_typeof(p_data)<>'object'
    or octet_length(p_data::text)>24576 then raise exception 'Revisa la publicación' using errcode='22023'; end if;
  if jsonb_typeof(p_data->'title')<>'string' or jsonb_typeof(p_data->'kind')<>'string'
    or (p_data ? 'body' and jsonb_typeof(p_data->'body')<>'string')
    or (p_data ? 'url' and jsonb_typeof(p_data->'url')<>'string') then raise exception 'Revisa el título, texto y enlace' using errcode='22023'; end if;
  v_title:=trim(p_data->>'title'); v_body:=trim(coalesce(p_data->>'body','')); v_kind:=p_data->>'kind'; v_url:=trim(coalesce(p_data->>'url',''));
  if v_title is null or char_length(v_title) not between 1 and 120 or char_length(v_body)>3000 or v_kind is null
    or v_kind not in ('note','infographic','document','presentation','book','video','link') or char_length(v_url)>2000
    or (v_url<>'' and (v_url !~ '^https://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]<>]*)?$' or v_url ~ '[<>]')) then
    raise exception 'Usa un título de hasta 120 caracteres, texto de hasta 3000 y un enlace https válido' using errcode='22023'; end if;
  if v_kind in ('video','link') and v_url='' then raise exception 'Agrega el enlace https del contenido' using errcode='22023'; end if;
  select * into old from private.course_board_posts where id=p_post_id for update;
  if found then
    mine:=case when old.author_is_teacher then teacher and old.author_user_id=(select auth.uid()) else old.author_student_id=(a->>'studentId')::uuid end;
    if old.course_id<>p_course_id or not coalesce(mine,false) then raise exception 'Solo puedes editar tus propias publicaciones' using errcode='42501'; end if;
  elsif p_expected_revision<>0 then raise exception 'La publicación ya no está disponible. Actualiza el tablero.' using errcode='PT409'; end if;
  if p_data->'attachment' is not null and p_data->'attachment'<>'null'::jsonb then
    if jsonb_typeof(p_data->'attachment')<>'object' or jsonb_typeof(p_data->'attachment'->'path')<>'string'
      or jsonb_typeof(p_data->'attachment'->'name')<>'string' then raise exception 'Revisa el archivo adjunto' using errcode='22023'; end if;
    v_path:=p_data->'attachment'->>'path'; v_name:=p_data->'attachment'->>'name';
    if char_length(v_name) not between 1 and 180 or v_name ~ '[[:cntrl:]/\\]' or split_part(v_path,'/',1)<>p_course_id::text
      or split_part(v_path,'/',2)<>'board' or (v_path is distinct from old.attachment_path and not private.board_file_access(v_path,'upload')) then
      raise exception 'El archivo no pertenece a esta publicación o no terminó de subirse' using errcode='42501'; end if;
    select metadata into meta from storage.objects where bucket_id='team-attachments' and name=v_path;
    v_size:=coalesce((meta->>'size')::bigint,0); v_type:=meta->>'mimetype';
    if not found or v_size not between 1 and 10485760 or v_type is distinct from private.board_mime(substring(v_path from '\.([a-z0-9]+)$'))
      or v_type is distinct from private.board_mime(lower(substring(v_name from '\.([A-Za-z0-9]+)$'))) then
      raise exception 'El archivo debe ser válido y de hasta 10 MB' using errcode='22023'; end if;
    if exists(select 1 from private.course_board_posts where attachment_path=v_path and id<>p_post_id) then
      raise exception 'Este archivo ya está publicado. Elige una copia nueva.' using errcode='22023'; end if;
  end if;
  if v_body='' and v_url='' and v_path is null then raise exception 'Escribe una nota, adjunta un archivo o agrega un enlace' using errcode='22023'; end if;
  if old.id is not null then
    -- Retrying the same new publication after a lost response is idempotent.
    if p_expected_revision=0 and old.revision=1 and old.title=v_title and old.body=v_body and old.kind=v_kind and old.url=v_url
      and old.attachment_path is not distinct from v_path and old.attachment_name is not distinct from v_name then return private.board_post_json(old,a); end if;
    if old.revision<>p_expected_revision then raise exception 'Esta publicación cambió en otro dispositivo. Actualiza el tablero antes de editarla.' using errcode='PT409'; end if;
    if old.state<>'visible' then raise exception 'Restaura la publicación antes de editarla; si la ocultó el docente, comunícate con él.' using errcode='42501'; end if;
    update private.course_board_posts set title=v_title,body=v_body,kind=v_kind,url=v_url,attachment_path=v_path,
      attachment_name=v_name,attachment_size=v_size,attachment_type=v_type,revision=revision+1,updated_at=now()
      where id=p_post_id returning * into saved;
  else
    if not teacher and exists(select 1 from private.course_board_posts where course_id=p_course_id and author_student_id=(a->>'studentId')::uuid
      and created_at>clock_timestamp()-interval '3 seconds') then raise exception 'Espera unos segundos antes de publicar de nuevo' using errcode='PT429'; end if;
    v_topic:=(a->>'topicId')::uuid; select name into v_topic_name from public.topics where id=v_topic and course_id=p_course_id;
    insert into private.course_board_posts(id,course_id,author_user_id,author_student_id,author_is_teacher,author_name,topic_id,topic_name,
      title,body,kind,url,attachment_path,attachment_name,attachment_size,attachment_type)
      values(p_post_id,p_course_id,(select auth.uid()),(a->>'studentId')::uuid,teacher,a->>'name',v_topic,coalesce(v_topic_name,''),
        v_title,v_body,v_kind,v_url,v_path,v_name,v_size,v_type) returning * into saved;
  end if;
  return private.board_post_json(saved,a);
exception when unique_violation then raise exception 'La publicación ya se procesó o cambió. Actualiza el tablero antes de repetirla.' using errcode='PT409';
end $$;

create function private.course_board_set_post_state(p_course_id uuid,p_post_id uuid,p_expected_revision integer,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.board_actor(p_course_id); p private.course_board_posts%rowtype; teacher boolean:=(a->>'isTeacher')::boolean; mine boolean;
begin
  select * into p from private.course_board_posts where id=p_post_id and course_id=p_course_id for update;
  if not found then raise exception 'La publicación ya no está disponible' using errcode='PT409'; end if;
  mine:=case when p.author_is_teacher then teacher and p.author_user_id=(select auth.uid()) else p.author_student_id=(a->>'studentId')::uuid end;
  if not teacher and not coalesce(mine,false) then raise exception 'Solo puedes administrar tus propias publicaciones' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<>p.revision then raise exception 'La publicación cambió. Actualiza el tablero.' using errcode='PT409'; end if;
  case p_action
    when 'pin','unpin' then
      if not teacher then raise exception 'Solo el docente puede destacar contenido' using errcode='42501'; end if;
      update private.course_board_posts set pinned=p_action='pin',revision=revision+1,updated_at=now() where id=p.id returning * into p;
    when 'hide' then
      if not teacher then raise exception 'Solo el docente puede ocultar contenido' using errcode='42501'; end if;
      update private.course_board_posts set state='hidden',revision=revision+1,updated_at=now() where id=p.id returning * into p;
    when 'remove' then
      if not coalesce(mine,false) then raise exception 'Solo el autor puede retirar su publicación' using errcode='42501'; end if;
      if p.state='hidden' and not teacher then raise exception 'Esta publicación fue ocultada por el docente' using errcode='42501'; end if;
      update private.course_board_posts set state='removed',revision=revision+1,updated_at=now() where id=p.id returning * into p;
    when 'restore' then
      if p.state='hidden' and not teacher then raise exception 'Solo el docente puede restaurar una publicación que ocultó' using errcode='42501'; end if;
      update private.course_board_posts set state='visible',revision=revision+1,updated_at=now() where id=p.id returning * into p;
    else raise exception 'Acción del tablero no válida' using errcode='22023';
  end case;
  return private.board_post_json(p,a);
end $$;

create function private.teacher_save_board_settings(p_course_id uuid,p_instructions text,p_posting_open boolean,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; g private.course_board_settings%rowtype;
begin
  perform 1 from public.courses where id=p_course_id and active and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  a:=private.board_actor(p_course_id);
  if p_instructions is null or char_length(p_instructions)>4000 or p_posting_open is null then raise exception 'Revisa las indicaciones del tablero' using errcode='22023'; end if;
  select * into g from private.course_board_settings where course_id=p_course_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(g.revision,0) then raise exception 'Las indicaciones cambiaron. Actualiza el tablero antes de guardar.' using errcode='PT409'; end if;
  insert into private.course_board_settings(course_id,instructions,posting_open,revision)
    values(p_course_id,trim(p_instructions),p_posting_open,1)
    on conflict(course_id) do update set instructions=excluded.instructions,posting_open=excluded.posting_open,revision=course_board_settings.revision+1,updated_at=now()
    returning * into g;
  return jsonb_build_object('instructions',g.instructions,'postingOpen',g.posting_open,'revision',g.revision);
end $$;

create function public.course_board(p_course_id uuid,p_kind text default '',p_scope text default 'all',p_topic_id uuid default null,p_search text default '',p_offset integer default 0,p_limit integer default 24)
returns jsonb language sql security invoker set search_path='' as $$ select private.course_board(p_course_id,p_kind,p_scope,p_topic_id,p_search,p_offset,p_limit); $$;
create function public.course_board_save_post(p_course_id uuid,p_post_id uuid,p_expected_revision integer,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.course_board_save_post(p_course_id,p_post_id,p_expected_revision,p_data); $$;
create function public.course_board_set_post_state(p_course_id uuid,p_post_id uuid,p_expected_revision integer,p_action text)
returns jsonb language sql security invoker set search_path='' as $$ select private.course_board_set_post_state(p_course_id,p_post_id,p_expected_revision,p_action); $$;
create function public.teacher_save_board_settings(p_course_id uuid,p_instructions text,p_posting_open boolean,p_expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.teacher_save_board_settings(p_course_id,p_instructions,p_posting_open,p_expected_revision); $$;

revoke all on function private.board_actor(uuid),private.board_post_json(private.course_board_posts,jsonb),private.board_mime(text),
  private.board_file_access(text,text),private.course_board(uuid,text,text,uuid,text,integer,integer),private.course_board_save_post(uuid,uuid,integer,jsonb),
  private.course_board_set_post_state(uuid,uuid,integer,text),private.teacher_save_board_settings(uuid,text,boolean,integer),
  public.course_board(uuid,text,text,uuid,text,integer,integer),public.course_board_save_post(uuid,uuid,integer,jsonb),
  public.course_board_set_post_state(uuid,uuid,integer,text),public.teacher_save_board_settings(uuid,text,boolean,integer) from public,anon,authenticated;
grant execute on function private.board_file_access(text,text),private.course_board(uuid,text,text,uuid,text,integer,integer),
  private.course_board_save_post(uuid,uuid,integer,jsonb),private.course_board_set_post_state(uuid,uuid,integer,text),private.teacher_save_board_settings(uuid,text,boolean,integer),
  public.course_board(uuid,text,text,uuid,text,integer,integer),public.course_board_save_post(uuid,uuid,integer,jsonb),
  public.course_board_set_post_state(uuid,uuid,integer,text),public.teacher_save_board_settings(uuid,text,boolean,integer) to authenticated;

notify pgrst,'reload schema';
