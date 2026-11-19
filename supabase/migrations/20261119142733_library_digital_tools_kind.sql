-- Add the resource type without changing records, ownership or permissions.
alter table private.course_board_posts drop constraint course_board_posts_kind_check;
alter table private.course_board_posts add constraint course_board_posts_kind_check check (kind in ('note','infographic','document','presentation','book','video','link','digital_tool'));

CREATE OR REPLACE FUNCTION private.course_board(p_course_id uuid, p_kind text, p_scope text, p_topic_id uuid, p_search text, p_offset integer, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb:=private.board_actor(p_course_id); settings jsonb; posts jsonb; total bigint; groups jsonb;
  teacher boolean:=coalesce((a->>'isTeacher')::boolean,false); sid uuid:=(a->>'studentId')::uuid;
begin
  if p_kind is null or p_kind not in ('','note','infographic','document','presentation','book','video','link','digital_tool')
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
end $function$;

CREATE OR REPLACE FUNCTION private.course_board_save_post(p_course_id uuid, p_post_id uuid, p_expected_revision integer, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or v_kind not in ('note','infographic','document','presentation','book','video','link','digital_tool') or char_length(v_url)>2000
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
end $function$;

CREATE OR REPLACE FUNCTION private.shared_library(p_kind text, p_scope text, p_search text, p_offset integer, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare posts jsonb; total bigint; uid uuid:=(select auth.uid());
begin
  if not private.library_member() then
    raise exception 'Regístrate con el código de una materia para consultar la biblioteca.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('','note','infographic','document','presentation','book','video','link','digital_tool')
    or p_scope is null or p_scope not in ('all','mine') or p_search is null or char_length(p_search)>120
    or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 48 then
    raise exception 'Revisa los filtros de la biblioteca.' using errcode='22023';
  end if;
  with filtered as (
    select p.* from private.course_board_posts p join public.courses c on c.id=p.course_id
    where c.active and p.state='visible'
      and (p_kind='' or p.kind=p_kind)
      and (p_scope='all' or (p.author_is_teacher and p.author_user_id=uid)
        or (not p.author_is_teacher and exists(select 1 from public.students s where s.id=p.author_student_id and s.auth_user_id=uid)))
      and (p_search='' or strpos(lower(p.title||' '||p.body||' '||p.author_name||' '||c.name),lower(p_search))>0)
  ), paged as (
    select * from filtered order by pinned desc,created_at desc,id desc offset p_offset limit p_limit
  )
  select (select count(*) from filtered),coalesce((
    select jsonb_agg((private.board_post_json(p::private.course_board_posts,'{}'::jsonb)-'topicId'-'topicName')
      || jsonb_build_object('courseId',p.course_id,'courseName',(select c.name from public.courses c where c.id=p.course_id),
        'mine',case when p.author_is_teacher then p.author_user_id=uid
          else exists(select 1 from public.students s where s.id=p.author_student_id and s.auth_user_id=uid) end)
      order by p.pinned desc,p.created_at desc,p.id desc) from paged p),'[]'::jsonb)
  into total,posts;
  return jsonb_build_object('actor',jsonb_build_object('isTeacher',false,'name','Comunidad'),
    'settings',jsonb_build_object('instructions','','postingOpen',false,'revision',0),'groups','[]'::jsonb,
    'posts',posts,'total',total,'nextOffset',p_offset+jsonb_array_length(posts),
    'hasMore',p_offset+jsonb_array_length(posts)<total);
end;
$function$;

