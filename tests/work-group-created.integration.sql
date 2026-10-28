-- Fictional records only. All changes and auth users are rolled back.
begin;
do $$
declare actor text; u uuid;
begin
 foreach actor in array array['owner','foreign_owner','student'] loop
  u:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,is_anonymous) values(u,'authenticated','authenticated',
   case when actor<>'student' then 'group-check-qa-'||u||'@example.invalid' else null end,actor='student');
  if actor<>'student' then insert into public.teachers values(u); end if;
  perform set_config('work_qa.'||actor,u::text,true);
 end loop;
end $$;
set local role authenticated;
do $$
declare c uuid; c2 uuid; suffix text; code text;
begin
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.owner'),true);
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 c:=public.create_course_with_groups('QA check de grupo de trabajo',code,2,5);
 c2:=public.create_course_with_groups('QA otra materia',
  'MAT-'||substr(suffix,12,5)||'-'||substr(suffix,17,5)||'-'||substr(suffix,22,5),1,5);
 perform set_config('work_qa.course',c::text,true); perform set_config('work_qa.course2',c2::text,true);
 perform set_config('work_qa.topic',public.teacher_overview(c)->'topics'->0->>'id',true);
 perform set_config('work_qa.empty_topic',public.teacher_overview(c)->'topics'->1->>'id',true);
 perform set_config('work_qa.other_topic',public.teacher_overview(c2)->'topics'->0->>'id',true);
 if public.teacher_overview(c)->'topics'->0->>'workGroupCreated'<>'false' then raise exception 'Existing/new topic marked automatically'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.student'),true);
 perform public.enroll_student_profile(code,'group-check-'||gen_random_uuid()||'@example.invalid',
  'Ana','Prueba','65000001','passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,14),'PA',22);
 perform public.save_student_avatar(c,'{"skin":2,"shirt":1,"hair":"short"}');
 perform public.choose_topic(c,current_setting('work_qa.topic')::uuid);
 perform public.team_chat_send(c,current_setting('work_qa.topic')::uuid,'Mensaje ficticio conservado al marcar el check');
 perform set_config('work_qa.student_id',public.my_profile(c)->>'id',true);
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.owner'),true);
 perform public.teacher_set_enrollment_review(c,current_setting('work_qa.student_id')::uuid,true);
 perform public.teacher_set_topic_locked(c,current_setting('work_qa.topic')::uuid,true);
 perform public.teacher_set_registration(c,false);
end $$;
reset role;
do $$
declare c uuid:=current_setting('work_qa.course')::uuid;
begin
 perform set_config('work_qa.before_students',(select jsonb_agg(to_jsonb(s) order by id)::text from public.students s where course_id=c),true);
 perform set_config('work_qa.before_course',(select to_jsonb(t)::text from public.courses t where id=c),true);
 perform set_config('work_qa.before_topics',(select jsonb_agg(to_jsonb(t)-'work_group_created' order by id)::text from public.topics t where course_id=c),true);
 perform set_config('work_qa.before_messages',(select jsonb_agg(to_jsonb(t) order by id)::text from public.team_messages t where course_id=c),true);
 perform set_config('work_qa.before_links',(select jsonb_agg(to_jsonb(t) order by student_id)::text from private.student_identity_links t where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('work_qa.course')::uuid; t uuid:=current_setting('work_qa.topic')::uuid;
 result jsonb; actor text;
begin
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.owner'),true);
 result:=public.teacher_set_work_group_created(c,t,true);
 if result->>'id'<>t::text or result->>'workGroupCreated'<>'true' then raise exception 'Check not saved'; end if;
 perform public.teacher_set_work_group_created(c,t,true);
 if (select x->>'workGroupCreated' from jsonb_array_elements(public.teacher_overview(c)->'topics') x where x->>'id'=t::text)<>'true' then raise exception 'Overview/reentry lost check'; end if;
 if public.teacher_overview(current_setting('work_qa.course2')::uuid)->'topics'->0->>'workGroupCreated'<>'false' then raise exception 'Check crossed course boundary'; end if;
 perform public.teacher_set_work_group_created(c,current_setting('work_qa.empty_topic')::uuid,true);
 perform public.teacher_set_work_group_created(c,current_setting('work_qa.empty_topic')::uuid,false);
 foreach actor in array array['student','foreign_owner'] loop
  perform set_config('request.jwt.claim.sub',current_setting('work_qa.'||actor),true);
  begin perform public.teacher_set_work_group_created(c,t,false);
   raise exception 'Non-owner changed check'; exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.student'),true);
 if public.course_room(c)::text like '%workGroupCreated%' or public.my_profile(c)::text like '%workGroupCreated%' then raise exception 'Teacher checklist exposed to student'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.teacher_set_work_group_created(c,t,false);
  raise exception 'No-session change allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.owner'),true);
 begin perform public.teacher_set_work_group_created(c,t,null);
  raise exception 'Null accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.teacher_set_work_group_created(c,current_setting('work_qa.other_topic')::uuid,true);
  raise exception 'Cross-course group changed'; exception when raise_exception then
   if sqlerrm<>'Grupo no disponible en esta materia' then raise; end if;
 end;
 perform public.teacher_set_work_group_created(c,t,false);
 perform public.teacher_set_work_group_created(c,t,false);
 perform public.teacher_set_work_group_created(c,t,true);
end $$;
reset role;
do $$
declare c uuid:=current_setting('work_qa.course')::uuid;
begin
 if (select jsonb_agg(to_jsonb(s) order by id)::text from public.students s where course_id=c)<>current_setting('work_qa.before_students') then raise exception 'Check changed identity/contact/avatar/membership/review'; end if;
 if (select to_jsonb(t)::text from public.courses t where id=c)<>current_setting('work_qa.before_course') then raise exception 'Check changed course/code/registration'; end if;
 if (select jsonb_agg(to_jsonb(t)-'work_group_created' order by id)::text from public.topics t where course_id=c)<>current_setting('work_qa.before_topics') then raise exception 'Check changed name/capacity/lock'; end if;
 if (select jsonb_agg(to_jsonb(t) order by id)::text from public.team_messages t where course_id=c)<>current_setting('work_qa.before_messages') then raise exception 'Check changed chat'; end if;
 if (select jsonb_agg(to_jsonb(t) order by student_id)::text from private.student_identity_links t where course_id=c)<>current_setting('work_qa.before_links') then raise exception 'Check changed canonical identity'; end if;
 if has_table_privilege('authenticated','public.topics','UPDATE') or has_table_privilege('anon','public.topics','SELECT') then raise exception 'Unexpected table grant'; end if;
 if has_function_privilege('anon','public.teacher_set_work_group_created(uuid,uuid,boolean)','EXECUTE') then raise exception 'Anonymous RPC grant'; end if;
 if (select prosecdef from pg_proc where oid='public.teacher_set_work_group_created(uuid,uuid,boolean)'::regprocedure) then raise exception 'Public wrapper elevated'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('work_qa.course')::uuid; t uuid:=current_setting('work_qa.topic')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('work_qa.owner'),true);
 -- A manually-created external group still exists if membership changes.
 perform public.teacher_release_student(c,current_setting('work_qa.student_id')::uuid);
 if (select x->>'workGroupCreated' from jsonb_array_elements(public.teacher_overview(c)->'topics') x where x->>'id'=t::text)<>'true' then raise exception 'Membership change erased manual tracking'; end if;
 perform public.teacher_set_course_active(c,false);
 begin perform public.teacher_set_work_group_created(c,t,false);
  raise exception 'Disabled course changed'; exception when raise_exception then
   if sqlerrm<>'Restaura la materia antes de cambiar el check del grupo de trabajo' then raise; end if;
 end;
 if (select x->>'workGroupCreated' from jsonb_array_elements(public.teacher_overview(c)->'topics') x where x->>'id'=t::text)<>'true' then raise exception 'Disabled overview/export lost check'; end if;
end $$;
reset role;
select 'PASS: check docente por grupo, aislamiento, permisos, reversión, persistencia y conservación de datos' as result;
rollback;
