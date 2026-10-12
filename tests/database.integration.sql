-- Run with a database administrator. All fixtures and assertions roll back.
begin;
do $$
declare t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,is_anonymous)
    values(t,'authenticated','authenticated','aula-qa-'||t||'@example.invalid',false),
      (s,'authenticated','authenticated',null,true),(m,'authenticated','authenticated',null,true),(o,'authenticated','authenticated',null,true);
  insert into public.teachers(user_id) values(t);
  perform set_config('aula.qa_teacher',t::text,true); perform set_config('aula.qa_student',s::text,true);
  perform set_config('aula.qa_mate',m::text,true); perform set_config('aula.qa_outsider',o::text,true);
end $$;
set local role authenticated;
do $$
declare c uuid; ts jsonb; denied boolean:=false; topic uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_teacher'),true);
  c:=public.create_course_with_groups('QA temporary classroom','MAT-QQQQQ-WWWWW-EEEEE',3,5);
  perform set_config('aula.qa_course',c::text,true);
  if jsonb_array_length(public.course_room(c))<>3 then raise exception 'Expected 3 groups'; end if;
  perform public.teacher_set_group_count(c,8,6);
  if jsonb_array_length(public.course_room(c))<>8 then raise exception 'Expected 8 groups'; end if;
  perform public.teacher_set_group_count(c,2,5);
  ts:=public.course_room(c);
  if jsonb_array_length(ts)<>2 then raise exception 'Expected 2 groups'; end if;
  topic:=(ts->0->>'id')::uuid;
  perform set_config('aula.qa_topic',topic::text,true);
  perform public.teacher_edit_topic(c,topic,'QA documents','Share a document',5);
  if not exists(select 1 from jsonb_array_elements(public.course_room(c)) v where v->>'name'='QA documents') then raise exception 'Edit failed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_student'),true);
  begin perform public.teacher_set_group_count(c,4,5); exception when others then denied:=true; end;
  if not denied then raise exception 'Student obtained teacher access'; end if;
end $$;
reset role;
do $$
declare c uuid:=current_setting('aula.qa_course')::uuid; topic uuid:=current_setting('aula.qa_topic')::uuid;
begin
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone,topic_id)
    select c,u,'QA','Temporary','QA','Temporary','0000-0000',topic
    from unnest(array[current_setting('aula.qa_student')::uuid,current_setting('aula.qa_mate')::uuid]) u;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('aula.qa_course')::uuid; topic uuid:=current_setting('aula.qa_topic')::uuid; p text; denied boolean:=false; messages jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_student'),true);
  p:=c||'/'||topic||'/'||current_setting('aula.qa_student')||'/'||gen_random_uuid()||'.pdf';
  perform set_config('aula.qa_path',p,true);
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('team-attachments',p,current_setting('aula.qa_student'),'{"size":100,"mimetype":"application/pdf"}');
  perform public.team_chat_send_file(c,topic,'',p,'Prueba.pdf');
  messages:=public.team_chat_read(c,topic);
  if jsonb_array_length(messages)<>1 or messages->0->'attachment'->>'name'<>'Prueba.pdf' then raise exception 'File message missing'; end if;
  -- Retry after a lost response must not duplicate an already committed attachment.
  perform public.team_chat_send_file(c,topic,'',p,'Prueba.pdf');
  if jsonb_array_length(public.team_chat_read(c,topic))<>1 then raise exception 'Duplicate attachment'; end if;
  if private.team_file_pending(p) then raise exception 'Posted attachment remained deletable'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_mate'),true);
  if not exists(select 1 from storage.objects where bucket_id='team-attachments' and name=p) then raise exception 'Teammate could not read attachment'; end if;
  if private.team_file_access(p,true) then raise exception 'Teammate can overwrite sender folder'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_outsider'),true);
  if exists(select 1 from storage.objects where bucket_id='team-attachments' and name=p) then raise exception 'Outsider can read attachment'; end if;
  begin perform public.team_chat_read(c,topic); exception when others then denied:=true; end;
  if not denied then raise exception 'Outsider can read chat'; end if;
  denied:=false;
  begin insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('team-attachments',c||'/'||topic||'/'||current_setting('aula.qa_outsider')||'/'||gen_random_uuid()||'.pdf',current_setting('aula.qa_outsider'),'{"size":100,"mimetype":"application/pdf"}');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Outsider can upload'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.qa_teacher'),true);
  denied:=false;
  begin perform public.teacher_edit_topic(c,topic,'QA documents','',1); exception when others then denied:=true; end;
  if not denied then raise exception 'Capacity dropped below member count'; end if;
  perform public.teacher_set_group_count(c,1,5);
  if jsonb_array_length(public.course_room(c))<>1 then raise exception 'Could not retire empty group'; end if;
  -- A retained or renamed higher-numbered group must not collide with a new default name.
  perform public.teacher_edit_topic(c,topic,'Grupo 2','',5);
  perform public.teacher_set_group_count(c,2,5);
  if (select count(distinct v->>'name') from jsonb_array_elements(public.course_room(c)) v)<>2 then
    raise exception 'Generated a duplicate group name'; end if;
end $$;
reset role;
select 'PASS: counts, editing, teacher authorization, file messages, idempotency, team isolation, capacity protection' as result;
rollback;
