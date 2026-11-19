-- Only fictional fixtures. No real course, student or resource is changed.
begin;
do $$
declare actor text; u uuid; c uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
  a uuid; b uuid; marker text:='shared-library-qa-'||gen_random_uuid(); path text;
begin
  foreach actor in array array['owner','foreign_owner','a','b','guest','incomplete'] loop
    u:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,is_anonymous)
      values(u,'authenticated','authenticated','library-qa-'||u||'@example.invalid',actor not in ('owner','foreign_owner'));
    if actor in ('owner','foreign_owner') then insert into public.teachers(user_id) values(u); end if;
    perform set_config('library_qa.'||actor,u::text,true);
  end loop;
  insert into public.courses(id,teacher_id,name,code_hash,active) values
    (c,current_setting('library_qa.owner')::uuid,'QA biblioteca A',gen_random_uuid()::text,true),
    (other,current_setting('library_qa.foreign_owner')::uuid,'QA biblioteca B',gen_random_uuid()::text,true);
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone) values
    (c,current_setting('library_qa.a')::uuid,'Ana','Prueba','Ana','Prueba','6511-0001'),
    (other,current_setting('library_qa.b')::uuid,'Luis','Prueba','Luis','Prueba','6511-0002'),
    (c,current_setting('library_qa.incomplete')::uuid,'Por','Completar','Por','Completar',null);
  select id into a from public.students where course_id=c and auth_user_id=current_setting('library_qa.a')::uuid;
  select id into b from public.students where course_id=other and auth_user_id=current_setting('library_qa.b')::uuid;
  perform set_config('library_qa.course',c::text,true); perform set_config('library_qa.other',other::text,true);
  perform set_config('library_qa.marker',marker,true);
  perform set_config('library_qa.post',gen_random_uuid()::text,true);
  path:=c||'/board/'||current_setting('library_qa.a')||'/'||gen_random_uuid()||'.pdf';
  perform set_config('library_qa.file',path,true);
  insert into storage.objects(bucket_id,name,metadata) values('team-attachments',path,'{"size":200,"mimetype":"application/pdf"}');
  insert into private.course_board_posts(id,course_id,author_user_id,author_student_id,author_is_teacher,author_name,title,body,kind,
    attachment_path,attachment_name,attachment_size,attachment_type)
    values(current_setting('library_qa.post')::uuid,c,current_setting('library_qa.a')::uuid,a,false,'Ana Prueba',marker||' archivo','Lectura para inspirar','document',path,'Lectura.pdf',200,'application/pdf');
  insert into private.course_board_posts(id,course_id,author_user_id,author_student_id,author_is_teacher,author_name,title,body,kind)
    values(gen_random_uuid(),other,current_setting('library_qa.b')::uuid,b,false,'Luis Prueba',marker||' idea','Una idea creativa','note');
  insert into private.course_board_posts(id,course_id,author_user_id,author_student_id,author_is_teacher,author_name,title,body,kind,state)
    values(gen_random_uuid(),c,current_setting('library_qa.a')::uuid,a,false,'Ana Prueba',marker||' oculta','No publicada','note','hidden'),
      (gen_random_uuid(),c,current_setting('library_qa.a')::uuid,a,false,'Ana Prueba',marker||' retirada','No publicada','note','removed');
  path:=c||'/board/'||current_setting('library_qa.a')||'/'||gen_random_uuid()||'.pdf';
  perform set_config('library_qa.pending',path,true);
  insert into storage.objects(bucket_id,name,metadata) values('team-attachments',path,'{"size":200,"mimetype":"application/pdf"}');
  path:=c||'/'||gen_random_uuid()||'/'||current_setting('library_qa.a')||'/'||gen_random_uuid()||'.pdf';
  perform set_config('library_qa.chat',path,true);
  insert into storage.objects(bucket_id,name,metadata) values('team-attachments',path,'{"size":200,"mimetype":"application/pdf"}');
end $$;
set local role authenticated;
do $$
declare result jsonb; marker text:=current_setting('library_qa.marker'); actor text;
  c uuid:=current_setting('library_qa.course')::uuid; other uuid:=current_setting('library_qa.other')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('library_qa.b'),true);
  result:=public.shared_library(p_search=>marker);
  if result->>'total'<>'2' then raise exception 'The library must include both courses and only published resources'; end if;
  if not exists(select 1 from jsonb_array_elements(result->'posts') p where p->>'courseId'=c::text)
    or not exists(select 1 from jsonb_array_elements(result->'posts') p where p->>'courseId'=other::text) then
    raise exception 'Cross-course resources are missing'; end if;
  if exists(select 1 from jsonb_array_elements(result->'posts') p where p ? 'topicName' or p ? 'topicId' or p ? 'email' or p ? 'phone') then
    raise exception 'The common library exposed unrelated participant data'; end if;
  if public.shared_library(p_search=>marker,p_scope=>'mine')->>'total'<>'1' then raise exception 'Mine filter crossed authors'; end if;
  if jsonb_array_length(public.shared_library(p_search=>marker,p_limit=>1)->'posts')<>1 then raise exception 'Pagination failed'; end if;
  if public.shared_library(p_search=>marker,p_kind=>'document')->>'total'<>'1' then raise exception 'Kind filter failed'; end if;
  begin perform public.shared_library(p_scope=>'hidden'); raise exception 'Global hidden filter accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.course_board(c); raise exception 'Library access granted course membership'; exception when insufficient_privilege then null; end;
  begin perform public.course_board_save_post(c,gen_random_uuid(),0,'{"title":"Ajena","body":"No permitida","kind":"note"}');
    raise exception 'Library access allowed writing in another course'; exception when insufficient_privilege then null; end;
  begin perform public.course_board_set_post_state(c,current_setting('library_qa.post')::uuid,1,'hide');
    raise exception 'Library reader moderated another author'; exception when insufficient_privilege then null; end;
  if not private.library_attachment_read(current_setting('library_qa.file'))
    or private.library_attachment_read(current_setting('library_qa.pending'))
    or private.library_attachment_read(current_setting('library_qa.chat')) then raise exception 'Attachment boundary failed'; end if;
  perform set_config('storage.operation','object.get_authenticated',true);
  if not exists(select 1 from storage.objects where bucket_id='team-attachments' and name=current_setting('library_qa.file')) then raise exception 'Published cross-course download denied'; end if;
  if exists(select 1 from storage.objects where bucket_id='team-attachments' and name in (current_setting('library_qa.pending'),current_setting('library_qa.chat'))) then raise exception 'Private upload exposed'; end if;
  perform set_config('storage.operation','object.list',true);
  if exists(select 1 from storage.objects where bucket_id='team-attachments' and name=current_setting('library_qa.file')) then raise exception 'Download policy allowed bucket listing'; end if;
  foreach actor in array array['guest','incomplete'] loop
    perform set_config('request.jwt.claim.sub',current_setting('library_qa.'||actor),true);
    begin perform public.shared_library(p_search=>marker); raise exception 'Unregistered viewer accepted'; exception when insufficient_privilege then null; end;
    if private.library_attachment_read(current_setting('library_qa.file')) then raise exception 'Unregistered download accepted'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.shared_library(); raise exception 'Sessionless access accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.course_board_posts set state='hidden' where id=current_setting('library_qa.post')::uuid;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('library_qa.b'),true);
  if public.shared_library(p_search=>current_setting('library_qa.marker'))->>'total'<>'1'
    or private.library_attachment_read(current_setting('library_qa.file')) then raise exception 'Hidden content remains globally accessible'; end if;
end $$;
reset role;
update private.course_board_posts set state='visible' where id=current_setting('library_qa.post')::uuid;
update public.courses set active=false where id=current_setting('library_qa.course')::uuid;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('library_qa.b'),true);
  if public.shared_library(p_search=>current_setting('library_qa.marker'))->>'total'<>'1'
    or private.library_attachment_read(current_setting('library_qa.file')) then raise exception 'Inactive course remains in the common library'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('library_qa.a'),true);
  begin perform public.shared_library(); raise exception 'Inactive enrollment grants access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.shared_library(); raise exception 'Anonymous role can execute library RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='shared_library' and p.prosecdef)
    or has_table_privilege('authenticated','private.course_board_posts','SELECT') then raise exception 'RPC boundary widened'; end if;
end $$;
select 'Shared library registration, cross-course reading, moderation and attachment checks passed' as result;
rollback;
