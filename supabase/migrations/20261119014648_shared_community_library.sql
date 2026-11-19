-- The shared library contains published creative resources, never submissions,
-- team chat, grades, contact lists or pending uploads.
create function private.library_member()
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.teachers t where t.user_id=(select auth.uid()))
    or exists(select 1 from public.students s join public.courses c on c.id=s.course_id
      where s.auth_user_id=(select auth.uid()) and s.phone is not null and c.active)
  );
$$;

create index course_board_posts_shared_order
  on private.course_board_posts(pinned desc,created_at desc,id desc) where state='visible';

create function private.shared_library(p_kind text,p_scope text,p_search text,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare posts jsonb; total bigint; uid uuid:=(select auth.uid());
begin
  if not private.library_member() then
    raise exception 'Regístrate con el código de una materia para consultar la biblioteca.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('','note','infographic','document','presentation','book','video','link')
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
$$;

create function private.library_attachment_read(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.library_member()
    and p_path ~ '^[0-9a-f-]{36}/board/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx|zip)$'
    and exists(select 1 from private.course_board_posts p join public.courses c on c.id=p.course_id
      where c.active and p.state='visible' and p.attachment_path=p_path);
$$;

create function public.shared_library(p_kind text default '',p_scope text default 'all',p_search text default '',p_offset integer default 0,p_limit integer default 24)
returns jsonb language sql security invoker set search_path='' as $$
  select private.shared_library(p_kind,p_scope,p_search,p_offset,p_limit);
$$;

revoke all on function private.library_member(),private.shared_library(text,text,text,integer,integer),
  private.library_attachment_read(text),public.shared_library(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function private.shared_library(text,text,text,integer,integer),
  private.library_attachment_read(text),public.shared_library(text,text,text,integer,integer) to authenticated;

create policy board_library_published_read on storage.objects for select to authenticated
  using(bucket_id='team-attachments'
    and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
    and private.library_attachment_read(name));

notify pgrst,'reload schema';
