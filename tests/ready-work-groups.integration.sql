-- Fictional data only; tests and records are rolled back together.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid(); student_user uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); foreign_c uuid:=gen_random_uuid(); disabled_c uuid:=gen_random_uuid(); empty_c uuid:=gen_random_uuid();
 full_t uuid:=gen_random_uuid(); checked_t uuid:=gen_random_uuid(); partial_t uuid:=gen_random_uuid();
 over_t uuid:=gen_random_uuid(); archived_t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,is_anonymous) values
  (owner_id,'authenticated','authenticated','ready-qa-'||owner_id||'@example.invalid',false),
  (foreign_id,'authenticated','authenticated','ready-qa-'||foreign_id||'@example.invalid',false),
  (student_user,'authenticated','authenticated',null,true);
 insert into public.teachers(user_id) values(owner_id),(foreign_id);
 insert into public.courses(id,teacher_id,name,code_hash,active) values
  (c,owner_id,'QA grupos listos',gen_random_uuid()::text,true),
  (empty_c,owner_id,'QA vacía',gen_random_uuid()::text,true),
  (foreign_c,foreign_id,'QA ajena',gen_random_uuid()::text,true),
  (disabled_c,owner_id,'QA deshabilitada',gen_random_uuid()::text,false);
 insert into public.topics(id,course_id,name,capacity,work_group_created,join_locked,archived) values
  (full_t,c,'Completo bloqueado',2,false,true,false),
  (checked_t,c,'Completo con check',1,true,false,false),
  (partial_t,c,'Incompleto bloqueado',2,false,true,false),
  (gen_random_uuid(),c,'Vacío sin check',1,false,false,false),
  (over_t,c,'Cupo superado',2,false,false,false),
  (archived_t,c,'Archivado completo',1,false,false,true),
  (gen_random_uuid(),foreign_c,'Ajeno completo',1,false,false,false),
  (gen_random_uuid(),disabled_c,'Inactivo completo',1,false,false,false);
 insert into public.students(id,course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,topic_id,enrollment_review) values
  (s,c,student_user,'Ana','Prueba','Ana','Prueba',full_t,true);
 insert into public.students(course_id,original_first_name,original_last_name,first_name,last_name,topic_id,enrollment_review)
 select c,'Persona','Ficticia','Persona','Ficticia',v.topic_id,false from (values
  (full_t),(checked_t),(partial_t),(over_t),(over_t),(over_t),(archived_t),(null::uuid)) v(topic_id);
 insert into public.students(course_id,original_first_name,original_last_name,first_name,last_name,topic_id)
 select t.course_id,'Otra','Ficticia','Otra','Ficticia',t.id from public.topics t where t.course_id in(foreign_c,disabled_c);
 perform set_config('ready_qa.owner',owner_id::text,true);perform set_config('ready_qa.foreign_owner',foreign_id::text,true);
 perform set_config('ready_qa.student',student_user::text,true);perform set_config('ready_qa.course',c::text,true);
 perform set_config('ready_qa.empty',empty_c::text,true);perform set_config('ready_qa.foreign',foreign_c::text,true);
 perform set_config('ready_qa.full',full_t::text,true);perform set_config('ready_qa.checked',checked_t::text,true);
 perform set_config('ready_qa.member',s::text,true);
 perform set_config('ready_qa.before',(select jsonb_build_object(
  'students',(select jsonb_agg(to_jsonb(x) order by id) from public.students x where course_id=c),
  'topics',(select jsonb_agg(to_jsonb(x) order by id) from public.topics x where course_id=c))::text),true);
end $$;
set local role authenticated;
do $$
declare rows jsonb; row jsonb; c uuid:=current_setting('ready_qa.course')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('ready_qa.owner'),true);
 rows:=public.teacher_live_course_counts();
 if jsonb_array_length(rows)<>2 then raise exception 'Wrong active/owned course scope'; end if;
 select x into strict row from jsonb_array_elements(rows) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'2' or row->>'pending_work_group_count'<>'4'
  or row->>'topic_count'<>'5' or row->>'student_count'<>'9' or row->>'enrollment_review_count'<>'1'
  or row->>'online_count'<>'0' then raise exception 'Readiness or existing counters wrong: %',row; end if;
 select x into strict row from jsonb_array_elements(rows) x where x->>'course_id'=current_setting('ready_qa.empty');
 if row->>'ready_work_group_count'<>'0' or row->>'pending_work_group_count'<>'0' then raise exception 'Empty course has alert'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('ready_qa.foreign_owner'),true);
 rows:=public.teacher_live_course_counts();
 if jsonb_array_length(rows)<>1 or rows->0->>'course_id'<>current_setting('ready_qa.foreign')
  or rows->0->>'ready_work_group_count'<>'1' then raise exception 'Foreign owner scope wrong'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('ready_qa.student'),true);
 begin perform public.teacher_live_course_counts();raise exception 'Student read readiness';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.teacher_live_course_counts();raise exception 'No-session read readiness';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('ready_qa.course')::uuid; snapshot text;
begin
 select jsonb_build_object(
  'students',(select jsonb_agg(to_jsonb(x) order by id) from public.students x where course_id=c),
  'topics',(select jsonb_agg(to_jsonb(x) order by id) from public.topics x where course_id=c))::text into snapshot;
 if snapshot<>current_setting('ready_qa.before') then raise exception 'Readiness changed records';end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('ready_qa.course')::uuid; row jsonb;
begin
 perform set_config('request.jwt.claim.sub',current_setting('ready_qa.owner'),true);
 perform public.teacher_set_work_group_created(c,current_setting('ready_qa.full')::uuid,true);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'1' or row->>'pending_work_group_count'<>'3' then raise exception 'Checked full group still alerts';end if;
 perform public.teacher_set_work_group_created(c,current_setting('ready_qa.full')::uuid,false);
 perform public.teacher_set_work_group_created(c,current_setting('ready_qa.checked')::uuid,false);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'3' then raise exception 'Cleared full-group check did not alert';end if;
 perform public.teacher_set_work_group_created(c,current_setting('ready_qa.checked')::uuid,true);
 perform public.teacher_release_student(c,current_setting('ready_qa.member')::uuid);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'1' then raise exception 'Underfilled group still alerts after release';end if;
 perform public.teacher_assign_student(c,current_setting('ready_qa.member')::uuid,current_setting('ready_qa.full')::uuid,false);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'2' then raise exception 'Refilled locked group did not alert';end if;
end $$;
reset role;
update public.topics set capacity=3 where id=current_setting('ready_qa.full')::uuid;
set local role authenticated;
do $$
declare row jsonb;c uuid:=current_setting('ready_qa.course')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('ready_qa.owner'),true);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'ready_work_group_count'<>'1' then raise exception 'Expanded capacity did not remove alert';end if;
end $$;
reset role;
rollback;
select 'ready work groups: PASS (fictional data rolled back)' as result;
