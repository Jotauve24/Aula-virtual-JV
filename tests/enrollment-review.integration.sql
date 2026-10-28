-- Synthetic users and courses only. Every write, including auth users, rolls back.
begin;
do $$
declare actor text; u uuid;
begin
 foreach actor in array array['owner','foreign_owner','marked','peer','other','unassigned','outsider'] loop
  u:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,is_anonymous) values(u,'authenticated','authenticated',
   case when actor in ('owner','foreign_owner') then 'review-qa-'||u||'@example.invalid' else null end,
   actor not in ('owner','foreign_owner'));
  if actor in ('owner','foreign_owner') then insert into public.teachers values(u); end if;
  perform set_config('review_qa.'||actor,u::text,true);
 end loop;
end $$;
set local role authenticated;
do $$
declare c uuid; c2 uuid; suffix text; code text; code2 text; actor text; i int:=0; doc text;
begin
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.owner'),true);
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 c:=public.create_course_with_groups('QA matrícula por verificar',code,2,2);
 code2:='MAT-'||substr(suffix,12,5)||'-'||substr(suffix,17,5)||'-'||substr(suffix,22,5);
 c2:=public.create_course_with_groups('QA otra materia',code2,1,5);
 perform set_config('review_qa.course',c::text,true); perform set_config('review_qa.course2',c2::text,true);
 perform set_config('review_qa.code',code,true);
 perform set_config('review_qa.team1',public.teacher_overview(c)->'topics'->0->>'id',true);
 perform set_config('review_qa.team2',public.teacher_overview(c)->'topics'->1->>'id',true);
 foreach actor in array array['marked','peer','other','unassigned'] loop
  i:=i+1; doc:='QA'||substr(upper(replace(gen_random_uuid()::text,'-','')),1,14);
  perform set_config('request.jwt.claim.sub',current_setting('review_qa.'||actor),true);
  perform public.enroll_student_profile(code,'review-'||actor||'-'||gen_random_uuid()||'@example.invalid',
   'Estudiante','Prueba '||i,'6400000'||i,'passport',doc,'PA',20+i);
  perform public.save_student_avatar(c,'{"skin":1,"shirt":2,"hair":"short"}');
  perform set_config('review_qa.student_'||actor,public.my_profile(c)->>'id',true);
  if actor<>'unassigned' then
   perform public.choose_topic(c,current_setting(case when actor='other' then 'review_qa.team2' else 'review_qa.team1' end)::uuid);
  end if;
  if actor='marked' then
   perform public.team_contact_setting(c,true);
   perform public.enroll_student_profile(code2,'review-same-'||gen_random_uuid()||'@example.invalid',
    'Estudiante','Prueba '||i,'6400000'||i,'passport',doc,'PA',20+i);
   perform set_config('review_qa.student_course2',public.my_profile(c2)->>'id',true);
  end if;
  if actor='peer' then perform public.team_chat_send(c,current_setting('review_qa.team1')::uuid,'Mensaje ficticio conservado'); end if;
 end loop;
end $$;
reset role;
do $$
declare c uuid:=current_setting('review_qa.course')::uuid;
begin
 perform set_config('review_qa.before_students',(select jsonb_agg(to_jsonb(s)-'enrollment_review' order by id)::text from public.students s where course_id=c),true);
 perform set_config('review_qa.before_course',(select to_jsonb(t)::text from public.courses t where id=c),true);
 perform set_config('review_qa.before_topics',(select jsonb_agg(to_jsonb(t) order by id)::text from public.topics t where course_id=c),true);
 perform set_config('review_qa.before_messages',(select jsonb_agg(to_jsonb(t) order by id)::text from public.team_messages t where course_id=c),true);
 perform set_config('review_qa.before_links',(select jsonb_agg(to_jsonb(t) order by student_id)::text from private.student_identity_links t where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('review_qa.course')::uuid; result jsonb; t jsonb; m jsonb; actor text; n int:=0;
begin
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.owner'),true);
 foreach actor in array array['marked','other','unassigned'] loop
  result:=public.teacher_set_enrollment_review(c,current_setting('review_qa.student_'||actor)::uuid,true);
  if result->>'enrollmentReview'<>'true' then raise exception 'Teacher flag not saved'; end if;
 end loop;
 perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,true);
 select count(*) into n from jsonb_array_elements(public.teacher_overview(c)->'students') s where s->>'enrollmentReview'='true';
 if n<>3 then raise exception 'Teacher overview flags differ'; end if;
 for t in select * from jsonb_array_elements(public.course_room(c)) loop
  for m in select * from jsonb_array_elements(t->'members') loop
   if m->'enrollmentReview'='null'::jsonb then raise exception 'Owner cannot see review flags'; end if;
  end loop;
 end loop;
 -- Both the flagged student and teammates can see only their team's observations.
 foreach actor in array array['marked','peer','other','unassigned'] loop
  perform set_config('request.jwt.claim.sub',current_setting('review_qa.'||actor),true);
  if public.my_profile(c)->>'enrollmentReview'<>(case when actor='peer' then 'false' else 'true' end) then raise exception 'Own review differs'; end if;
  for t in select * from jsonb_array_elements(public.course_room(c)) loop
   for m in select * from jsonb_array_elements(t->'members') loop
    if t->>'id' is distinct from public.my_profile(c)->>'topicId' and m->'enrollmentReview'<>'null'::jsonb then
     raise exception 'Review exposed to another team or unassigned student';
    end if;
    if actor='peer' and m->>'id'=current_setting('review_qa.student_marked') and m->>'enrollmentReview'<>'true' then raise exception 'Team warning missing'; end if;
   end loop;
  end loop;
  begin
   perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
   raise exception 'Student changed teacher observation';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.marked'),true);
 perform public.enroll_student_profile(current_setting('review_qa.code'));
 if public.my_profile(c)->>'enrollmentReview'<>'true' then raise exception 'Resume cleared flag'; end if;
 if public.my_profile(current_setting('review_qa.course2')::uuid)->>'enrollmentReview'<>'false' then raise exception 'Flag leaked to second subject'; end if;
 foreach actor in array array['foreign_owner','outsider'] loop
  perform set_config('request.jwt.claim.sub',current_setting('review_qa.'||actor),true);
  begin perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
   raise exception 'Outsider changed observation'; exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
  raise exception 'No-session update allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.owner'),true);
 begin perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,null);
  raise exception 'Null review allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_course2')::uuid,true);
  raise exception 'Cross-course profile allowed'; exception when raise_exception then
   if sqlerrm<>'Estudiante no disponible en esta materia' then raise; end if;
 end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('review_qa.course')::uuid;
begin
 if (select jsonb_agg(to_jsonb(s)-'enrollment_review' order by id)::text from public.students s where course_id=c)<>current_setting('review_qa.before_students') then raise exception 'Review changed profile/contact/membership'; end if;
 if (select to_jsonb(t)::text from public.courses t where id=c)<>current_setting('review_qa.before_course') then raise exception 'Review changed code/registration'; end if;
 if (select jsonb_agg(to_jsonb(t) order by id)::text from public.topics t where course_id=c)<>current_setting('review_qa.before_topics') then raise exception 'Review changed topics'; end if;
 if (select jsonb_agg(to_jsonb(t) order by id)::text from public.team_messages t where course_id=c)<>current_setting('review_qa.before_messages') then raise exception 'Review changed messages'; end if;
 if (select jsonb_agg(to_jsonb(t) order by student_id)::text from private.student_identity_links t where course_id=c)<>current_setting('review_qa.before_links') then raise exception 'Review changed canonical identity'; end if;
 if has_table_privilege('authenticated','public.students','UPDATE') or has_table_privilege('anon','public.students','SELECT') then raise exception 'Unexpected table grants'; end if;
 if has_function_privilege('anon','public.teacher_set_enrollment_review(uuid,uuid,boolean)','EXECUTE') then raise exception 'Anonymous RPC grant'; end if;
 if (select prosecdef from pg_proc where oid='public.teacher_set_enrollment_review(uuid,uuid,boolean)'::regprocedure) then raise exception 'Public wrapper elevated'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('review_qa.course')::uuid; t jsonb; m jsonb;
begin
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.owner'),true);
 perform public.teacher_set_registration(c,false);
 perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
 perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,true);
 perform public.teacher_set_topic_locked(c,current_setting('review_qa.team2')::uuid,true);
 perform public.teacher_assign_student(c,current_setting('review_qa.student_marked')::uuid,current_setting('review_qa.team2')::uuid,false);
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.peer'),true);
 for t in select * from jsonb_array_elements(public.course_room(c)) loop
  if t->>'id'=current_setting('review_qa.team1') then
   for m in select * from jsonb_array_elements(t->'members') loop
    if m->>'enrollmentReview'<>'false' then raise exception 'Old team retained moved warning'; end if;
   end loop;
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.marked'),true);
 if public.my_profile(c)->>'enrollmentReview'<>'true' then raise exception 'Transfer erased review'; end if;
 perform public.team_chat_send(c,current_setting('review_qa.team2')::uuid,'La observación no bloquea el chat');
 perform set_config('request.jwt.claim.sub',current_setting('review_qa.owner'),true);
 perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
 perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,false);
 perform public.teacher_set_course_active(c,false);
 begin perform public.teacher_set_enrollment_review(c,current_setting('review_qa.student_marked')::uuid,true);
  raise exception 'Disabled subject changed'; exception when raise_exception then
   if sqlerrm<>'Restaura la materia antes de cambiar las marcas de matrícula' then raise; end if;
 end;
 if (select s->>'enrollmentReview' from jsonb_array_elements(public.teacher_overview(c)->'students') s where s->>'id'=current_setting('review_qa.student_marked'))<>'false' then raise exception 'Clear failed in export'; end if;
end $$;
reset role;
select 'PASS: matrícula por verificar, permisos, privacidad, matrícula cerrada, traslados y conservación de datos' as result;
rollback;
