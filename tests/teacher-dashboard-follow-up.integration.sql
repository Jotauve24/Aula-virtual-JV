-- Only fictional records, inside a rolled-back transaction.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid(); student_user uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); empty_c uuid:=gen_random_uuid(); foreign_c uuid:=gen_random_uuid(); disabled_c uuid:=gen_random_uuid();
 t uuid:=gen_random_uuid(); locked_t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); offline_s uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,is_anonymous) values
  (owner_id,'authenticated','authenticated','dashboard-qa-'||owner_id||'@example.invalid',false),
  (foreign_id,'authenticated','authenticated','dashboard-qa-'||foreign_id||'@example.invalid',false),
  (student_user,'authenticated','authenticated',null,true);
 insert into public.teachers(user_id) values(owner_id),(foreign_id);
 insert into public.courses(id,teacher_id,name,code_hash,active) values
  (c,owner_id,'QA pendientes',gen_random_uuid()::text,true),
  (empty_c,owner_id,'QA vacía',gen_random_uuid()::text,true),
  (foreign_c,foreign_id,'QA ajena',gen_random_uuid()::text,true),
  (disabled_c,owner_id,'QA deshabilitada',gen_random_uuid()::text,false);
 insert into public.topics(id,course_id,name,capacity,work_group_created,join_locked,archived) values
  (t,c,'Con check',5,true,false,false),
  (locked_t,c,'Pendiente bloqueado',5,false,true,false),
  (gen_random_uuid(),c,'Pendiente vacío',5,false,false,false),
  (gen_random_uuid(),c,'Archivado sin check',5,false,false,true),
  (gen_random_uuid(),foreign_c,'Ajeno pendiente',5,false,false,false),
  (gen_random_uuid(),disabled_c,'Inactivo pendiente',5,false,false,false);
 insert into public.students(id,course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,topic_id,enrollment_review) values
  (s,c,student_user,'Ana','Prueba','Ana','Prueba',t,true),
  (offline_s,c,null,'Bea','Prueba','Bea','Prueba',locked_t,true),
  (gen_random_uuid(),c,null,'Carla','Prueba','Carla','Prueba',null,true),
  (gen_random_uuid(),foreign_c,null,'Ajena','Prueba','Ajena','Prueba',null,true),
  (gen_random_uuid(),disabled_c,null,'Inactiva','Prueba','Inactiva','Prueba',null,true);
 insert into private.classroom_presence(student_id,course_id,x,y,direction,seen_at) values
  (s,c,100,100,'down',now()-interval '1 second'),
  (offline_s,c,100,100,'down',now()-interval '60 seconds');
 perform set_config('follow_qa.owner',owner_id::text,true);
 perform set_config('follow_qa.foreign_owner',foreign_id::text,true);
 perform set_config('follow_qa.student',student_user::text,true);
 perform set_config('follow_qa.course',c::text,true);
 perform set_config('follow_qa.empty',empty_c::text,true);
 perform set_config('follow_qa.foreign',foreign_c::text,true);
 perform set_config('follow_qa.disabled',disabled_c::text,true);
 perform set_config('follow_qa.topic',t::text,true);
 perform set_config('follow_qa.student_id',s::text,true);
 perform set_config('follow_qa.before',(select jsonb_build_object(
  'students',(select jsonb_agg(to_jsonb(x) order by x.id) from public.students x where course_id=c),
  'topics',(select jsonb_agg(to_jsonb(x) order by x.id) from public.topics x where course_id=c),
  'course',(select to_jsonb(x) from public.courses x where id=c))::text),true);
end $$;
set local role authenticated;
do $$
declare rows jsonb; row jsonb; c uuid:=current_setting('follow_qa.course')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('follow_qa.owner'),true);
 rows:=public.teacher_live_course_counts();
 if jsonb_array_length(rows)<>2 then raise exception 'Wrong owner/active-course scope'; end if;
 select x into strict row from jsonb_array_elements(rows) x where x->>'course_id'=c::text;
 if row->>'student_count'<>'3' or row->>'topic_count'<>'3'
  or row->>'pending_work_group_count'<>'2' or row->>'enrollment_review_count'<>'3' then
  raise exception 'Counts multiplied, lost offline/unassigned students, or counted archived group: %',row;
 end if;
 if row->>'online_count'<>'1' or jsonb_array_length(row->'students')<>1 then raise exception 'Presence changed'; end if;
 if row->'students'->0->>'id'<>current_setting('follow_qa.student_id')
  or row->'students'->0->>'name'<>'Ana Prueba' or row->'students'->0->>'group'<>'Con check'
  or row->'students'->0->>'seen_at' is null or row->>'observed_at' is null then raise exception 'Roster compatibility lost'; end if;
 if (row->'students')::text like '%enrollment%' or (row->'students')::text like '%work_group%' then raise exception 'Follow-up exposed per-person in online roster'; end if;
 select x into strict row from jsonb_array_elements(rows) x where x->>'course_id'=current_setting('follow_qa.empty');
 if row->>'student_count'<>'0' or row->>'topic_count'<>'0' or row->>'pending_work_group_count'<>'0'
  or row->>'enrollment_review_count'<>'0' or row->>'online_count'<>'0' then raise exception 'Empty course is not zero'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('follow_qa.foreign_owner'),true);
 rows:=public.teacher_live_course_counts();
 if jsonb_array_length(rows)<>1 or rows->0->>'course_id'<>current_setting('follow_qa.foreign') then raise exception 'Owner isolation failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('follow_qa.student'),true);
 begin perform public.teacher_live_course_counts(); raise exception 'Student read teacher dashboard';
  exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.teacher_live_course_counts(); raise exception 'No-session read teacher dashboard';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('follow_qa.course')::uuid; snapshot text;
begin
 select jsonb_build_object(
  'students',(select jsonb_agg(to_jsonb(x) order by x.id) from public.students x where course_id=c),
  'topics',(select jsonb_agg(to_jsonb(x) order by x.id) from public.topics x where course_id=c),
  'course',(select to_jsonb(x) from public.courses x where id=c))::text into snapshot;
 if snapshot<>current_setting('follow_qa.before') then raise exception 'Dashboard read changed records'; end if;
 if has_function_privilege('anon','public.teacher_live_course_counts()','EXECUTE')
  or has_function_privilege('anon','private.teacher_dashboard_snapshot()','EXECUTE') then raise exception 'Anonymous execute granted'; end if;
 if (select prosecdef from pg_proc where oid='public.teacher_live_course_counts()'::regprocedure) then raise exception 'Public RPC elevated'; end if;
 if has_table_privilege('authenticated','public.students','SELECT') then raise exception 'Direct student table exposed'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('follow_qa.course')::uuid; row jsonb; t record; s record;
begin
 perform set_config('request.jwt.claim.sub',current_setting('follow_qa.owner'),true);
 perform public.teacher_set_work_group_created(c,current_setting('follow_qa.topic')::uuid,false);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'pending_work_group_count'<>'3' then raise exception 'Cleared check not counted'; end if;
 for t in select x from jsonb_array_elements(public.teacher_overview(c)->'topics') x loop
  perform public.teacher_set_work_group_created(c,(t.x->>'id')::uuid,true);
 end loop;
 for s in select x from jsonb_array_elements(public.teacher_overview(c)->'students') x loop
  perform public.teacher_set_enrollment_review(c,(s.x->>'id')::uuid,false);
 end loop;
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'pending_work_group_count'<>'0' or row->>'enrollment_review_count'<>'0' then raise exception 'Cleared pending flags not zero'; end if;
 perform public.teacher_set_course_active(c,false);
 if exists(select 1 from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text) then raise exception 'Disabled course still active'; end if;
 perform public.teacher_set_course_active(c,true);
 select x into strict row from jsonb_array_elements(public.teacher_live_course_counts()) x where x->>'course_id'=c::text;
 if row->>'pending_work_group_count'<>'0' then raise exception 'Restored course lost follow-up'; end if;
end $$;
reset role;
rollback;
select 'teacher dashboard follow-up: PASS (fictional data rolled back)' as result;
