-- Fictional identities only. Every fixture and operation rolls back.
begin;
do $$
declare actor text; u uuid; c uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
begin
  foreach actor in array array['owner','foreign_owner','a','b','outside','incomplete','recovered'] loop
    u:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,is_anonymous)
      values(u,'authenticated','authenticated','grade-qa-'||u||'@example.invalid',actor not in ('owner','foreign_owner','recovered'));
    if actor in ('owner','foreign_owner') then insert into public.teachers(user_id) values(u); end if;
    perform set_config('board_qa.'||actor,u::text,true);
  end loop;
  insert into public.courses(id,teacher_id,name,code_hash,active) values
    (c,current_setting('board_qa.owner')::uuid,'QA tablero',gen_random_uuid()::text,true),
    (other,current_setting('board_qa.foreign_owner')::uuid,'QA tablero ajeno',gen_random_uuid()::text,true);
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone)
    values(c,current_setting('board_qa.a')::uuid,'Ana','Prueba','Ana','Prueba','6510-0001'),
      (c,current_setting('board_qa.b')::uuid,'Luis','Prueba','Luis','Prueba','6510-0002'),
      (other,current_setting('board_qa.outside')::uuid,'Nora','Prueba','Nora','Prueba','6510-0003'),
      (c,current_setting('board_qa.incomplete')::uuid,'Por','Completar','Por','Completar',null);
  perform set_config('board_qa.course',c::text,true); perform set_config('board_qa.other',other::text,true);
  perform set_config('board_qa.student_a',(select id::text from public.students where course_id=c and auth_user_id=current_setting('board_qa.a')::uuid),true);
  perform set_config('board_qa.students_before',(select jsonb_agg(to_jsonb(s) order by s.id)::text from public.students s where course_id=c),true);
end $$;
do $$
declare c uuid:=current_setting('board_qa.course')::uuid; t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); f text;
begin
  insert into public.topics(id,course_id,name,position,capacity) values(t1,c,'Equipo de prueba 1',1,5),(t2,c,'Equipo de prueba 2',2,5);
  update public.students set topic_id=t1 where course_id=c and auth_user_id=current_setting('board_qa.a')::uuid;
  update public.students set topic_id=t2 where course_id=c and auth_user_id=current_setting('board_qa.b')::uuid;
  perform set_config('board_qa.topic1',t1::text,true);
  perform set_config('board_qa.note',gen_random_uuid()::text,true); perform set_config('board_qa.document',gen_random_uuid()::text,true);
  f:=c||'/board/'||current_setting('board_qa.a')||'/'||gen_random_uuid()||'.pdf'; perform set_config('board_qa.file',f,true);
  insert into storage.objects(bucket_id,name,metadata) values('team-attachments',f,'{"size":200,"mimetype":"application/pdf"}');
  f:=c||'/'||t1||'/'||current_setting('board_qa.a')||'/'||gen_random_uuid()||'.pdf'; perform set_config('board_qa.chat_file',f,true);
  insert into storage.objects(bucket_id,name,metadata) values('team-attachments',f,'{"size":200,"mimetype":"application/pdf"}');
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('board_qa.course')::uuid; n uuid:=current_setting('board_qa.note')::uuid;
  doc uuid:=current_setting('board_qa.document')::uuid; data jsonb; result jsonb; bad jsonb; actor text; rev integer; file text:=current_setting('board_qa.file');
begin
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.a'),true);
  result:=public.course_board(c);
  if result->>'total'<>'0' or result->'settings'->>'revision'<>'0' or result->'actor'->>'isTeacher'<>'false' then raise exception 'Empty board invalid'; end if;
  data:='{"title":" Nota de prueba ","body":"Contenido de prueba","kind":"note","url":"","authorName":"Forged","pinned":true,"state":"hidden"}';
  result:=public.course_board_save_post(c,n,0,data);
  if result->>'title'<>'Nota de prueba' or result->>'authorName'<>'Ana Prueba' or result->>'topicName'<>'Equipo de prueba 1'
    or result->>'pinned'<>'false' or result->>'state'<>'visible' then raise exception 'Untrusted ownership or fields accepted'; end if;
  if public.course_board_save_post(c,n,0,data)->>'revision'<>'1' or public.course_board(c)->>'total'<>'1' then raise exception 'Create retry duplicated'; end if;
  result:=public.course_board_save_post(c,n,1,data||'{"body":"Texto corregido"}'); if result->>'revision'<>'2' then raise exception 'Edit failed'; end if;
  begin perform public.course_board_save_post(c,n,1,data); raise exception 'Stale edit accepted'; exception when sqlstate 'PT409' then null; end;
  foreach bad in array array['{}'::jsonb,'{"title":"","body":"A","kind":"note"}'::jsonb,
    '{"title":"A","body":"B","kind":"constructor"}'::jsonb,'{"title":"A","body":"","kind":"note"}'::jsonb,
    '{"title":"A","body":"B","kind":"link","url":"javascript:alert(1)"}'::jsonb,
    '{"title":"A","body":"B","kind":"video","url":""}'::jsonb,
    '{"title":"A","body":"B","kind":"link","url":"https://user:password@example.invalid"}'::jsonb] loop
    begin perform public.course_board_save_post(c,gen_random_uuid(),0,bad); raise exception 'Invalid post accepted: %',bad; exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.course_board_set_post_state(c,n,2,'pin'); raise exception 'Student pinned a post'; exception when insufficient_privilege then null; end;
  if not private.board_file_access(file,'read') or private.board_file_access(current_setting('board_qa.chat_file'),'read') then raise exception 'Board namespace leak'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.b'),true);
  result:=public.course_board(c); if result->>'total'<>'1' or result->'posts'->0->>'mine'='true' then raise exception 'Peer group cannot view board'; end if;
  begin perform public.course_board_save_post(c,n,2,data); raise exception 'Peer edited author content'; exception when insufficient_privilege then null; end;
  begin perform public.course_board_set_post_state(c,n,2,'remove'); raise exception 'Peer removed author content'; exception when insufficient_privilege then null; end;
  if private.board_file_access(file,'read') or private.board_file_access(file,'upload') then raise exception 'Peer read pending file'; end if;
  if exists(select 1 from storage.objects where bucket_id='team-attachments' and name=file) then raise exception 'Storage pending read leak'; end if;
  if exists(select 1 from storage.objects where bucket_id='team-attachments' and name=current_setting('board_qa.chat_file')) then raise exception 'Private chat opened to peers'; end if;
  foreach actor in array array['foreign_owner','outside','incomplete'] loop
    perform set_config('request.jwt.claim.sub',current_setting('board_qa.'||actor),true);
    begin perform public.course_board(c); raise exception 'Foreign user read board'; exception when insufficient_privilege then null; end;
    begin perform public.course_board_save_post(c,gen_random_uuid(),0,data); raise exception 'Foreign user posted'; exception when insufficient_privilege then null; end;
    begin perform public.course_board_set_post_state(c,n,2,'hide'); raise exception 'Foreign user moderated'; exception when insufficient_privilege then null; end;
    if private.board_file_access(file,'read') then raise exception 'Foreign user read file'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.owner'),true);
  result:=public.teacher_save_board_settings(c,'Publica una infografía por equipo.',false,0);
  if result->>'revision'<>'1' or result->>'postingOpen'<>'false' then raise exception 'Settings not saved'; end if;
  begin perform public.teacher_save_board_settings(c,'Stale',true,0); raise exception 'Stale settings accepted'; exception when sqlstate 'PT409' then null; end;
  result:=public.course_board_set_post_state(c,n,2,'hide'); if result->>'revision'<>'3' then raise exception 'Teacher hide failed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.a'),true);
  begin perform public.course_board_save_post(c,gen_random_uuid(),0,data); raise exception 'Closed board accepted post'; exception when insufficient_privilege then null; end;
  if private.board_file_access(file,'upload') or not private.board_file_access(file,'cancel') then raise exception 'Closed board upload/cancel incorrect'; end if;
  begin perform public.course_board_set_post_state(c,n,3,'restore'); raise exception 'Student restored teacher-hidden post'; exception when insufficient_privilege then null; end;
  begin perform public.course_board_set_post_state(c,n,3,'remove'); raise exception 'Student bypassed hidden state'; exception when insufficient_privilege then null; end;
  if public.course_board(c,p_scope=>'mine')->>'total'<>'1' then raise exception 'Author lost own hidden post'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.b'),true);
  if public.course_board(c)->>'total'<>'0' or public.course_board(c,p_scope=>'hidden')->>'total'<>'0' then raise exception 'Hidden content leaked'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.owner'),true);
  if public.course_board(c,p_scope=>'hidden')->>'total'<>'1' then raise exception 'Teacher cannot find hidden content'; end if;
  perform public.course_board_set_post_state(c,n,3,'restore');
  result:=public.teacher_save_board_settings(c,'Indicaciones corregidas.',true,1);
  if result->>'revision'<>'2' then raise exception 'Settings revision lost'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.a'),true);
  result:=public.course_board_set_post_state(c,n,4,'remove');
  result:=public.course_board_set_post_state(c,n,5,'restore'); if result->>'revision'<>'6' then raise exception 'Author withdraw/restore failed'; end if;
  data:=jsonb_build_object('title','Documento de prueba','body','','kind','document','url','','attachment',jsonb_build_object('path',file,'name','Ejemplo.pdf'));
  begin perform public.course_board_save_post(c,doc,0,data); raise exception 'Publish rate limit missing'; exception when sqlstate 'PT429' then null; end;
  begin perform public.course_board_save_post(c,doc,0,jsonb_set(data,'{attachment,path}',to_jsonb(current_setting('board_qa.chat_file'))));
    raise exception 'Private chat file reused on board'; exception when insufficient_privilege then null; end;
  begin perform public.course_board_save_post(c,doc,0,jsonb_set(data,'{attachment,path}',to_jsonb(replace(file,current_setting('board_qa.a'),current_setting('board_qa.b')))));
    raise exception 'Another publisher file reused'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.course_board_posts set created_at=now()-interval '1 minute' where course_id=current_setting('board_qa.course')::uuid;
set local role authenticated;
do $$
declare c uuid:=current_setting('board_qa.course')::uuid; d uuid:=current_setting('board_qa.document')::uuid; result jsonb; path text:=current_setting('board_qa.file');
begin
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.a'),true);
  begin
    perform public.course_board_save_post(c,d,0,jsonb_build_object('title','Archivo inválido','body','','kind','document','url','',
      'attachment',jsonb_build_object('path',path,'name','Programa.exe')));
    raise exception 'Executable download name accepted';
  exception when invalid_parameter_value then null; end;
  result:=public.course_board_save_post(c,d,0,jsonb_build_object('title','Documento de prueba','body','','kind','document','url','','attachment',jsonb_build_object('path',path,'name','Ejemplo.pdf')));
  if result->'attachment'->>'type'<>'application/pdf' or result->'attachment'->>'size'<>'200' then raise exception 'Storage metadata not canonical'; end if;
  if private.board_file_access(path,'cancel') then raise exception 'Published file can be cancelled'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.b'),true);
  if not private.board_file_access(path,'read') or not exists(select 1 from storage.objects where bucket_id='team-attachments' and name=path) then raise exception 'Shared file inaccessible'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.owner'),true);
  if not path=any(public.teacher_course_file_paths(c)) then raise exception 'Course cleanup manifest omits board files'; end if;
  perform public.course_board_set_post_state(c,d,1,'hide');
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.b'),true);
  if private.board_file_access(path,'read') or exists(select 1 from storage.objects where bucket_id='team-attachments' and name=path) then raise exception 'Hidden file accessible to peer'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.owner'),true);
  perform public.course_board_set_post_state(c,d,2,'restore');
end $$;
reset role;
update public.students set auth_user_id=current_setting('board_qa.recovered')::uuid where id=current_setting('board_qa.student_a')::uuid;
set local role authenticated;
do $$
declare c uuid:=current_setting('board_qa.course')::uuid; d uuid:=current_setting('board_qa.document')::uuid; result jsonb; data jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.a'),true);
  begin perform public.course_board(c); raise exception 'Former account retained student access'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.recovered'),true);
  if public.course_board(c,p_scope=>'mine')->>'total'<>'2' then raise exception 'Recovery lost authorship'; end if;
  data:=jsonb_build_object('title','Documento recuperado','body','Actualizado desde otra cuenta','kind','document','url','','attachment',jsonb_build_object('path',current_setting('board_qa.file'),'name','Ejemplo.pdf'));
  result:=public.course_board_save_post(c,d,3,data);
  if result->>'mine'<>'true' or result->>'revision'<>'4' then raise exception 'Recovery edit failed'; end if;
  begin perform 1 from private.course_board_posts; raise exception 'Direct private posts readable'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.course_board_settings; raise exception 'Direct private settings readable'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.course_board(c); raise exception 'Sessionless access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.courses set active=false where id=current_setting('board_qa.course')::uuid;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('board_qa.recovered'),true);
  begin perform public.course_board(current_setting('board_qa.course')::uuid); raise exception 'Disabled course accessible'; exception when insufficient_privilege then null; end;
  if private.board_file_access(current_setting('board_qa.file'),'read') then raise exception 'Disabled file accessible'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin perform public.course_board(current_setting('board_qa.course')::uuid); raise exception 'Unauthenticated RPC access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('course_board','course_board_save_post','course_board_set_post_state','teacher_save_board_settings') and p.prosecdef) then raise exception 'Public security-definer exposed'; end if;
  if has_table_privilege('authenticated','private.course_board_posts','SELECT') or has_table_privilege('anon','private.course_board_posts','SELECT') then raise exception 'Direct table grant'; end if;
end $$;
select 'Content board isolation, files, authorship, recovery and moderation checks passed' as result;
rollback;
