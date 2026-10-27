-- Every identity and record is fictional and rolled back. No email is sent.
begin;
do $$
declare actor text; u uuid;
begin
  foreach actor in array array['owner','foreign_owner','one','two','three','four','five','six','seven','eight','nine'] loop
    u:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,is_anonymous) values
      (u,'authenticated','authenticated',case when actor in ('owner','foreign_owner') then 'group-qa-'||u||'@example.invalid' else null end,
       actor not in ('owner','foreign_owner'));
    if actor in ('owner','foreign_owner') then insert into public.teachers values(u); end if;
    perform set_config('group_qa.'||actor,u::text,true);
  end loop;
end $$;
set local role authenticated;
do $$
declare actor text; n int:=0; c uuid; room jsonb; suffix text; code text;
begin
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  c:=public.create_course_with_groups('QA bloqueo y cupos',code,3,5);
  perform set_config('group_qa.course',c::text,true);
  foreach actor in array array['one','two','three','four','five','six','seven','eight','nine'] loop
    n:=n+1;
    perform set_config('request.jwt.claim.sub',current_setting('group_qa.'||actor),true);
    perform public.enroll_student_document(code,'group-qa-'||gen_random_uuid()||'@example.invalid',
      'Persona','Prueba '||n,'6200000'||n,'passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,12),'CO');
    perform public.save_student_avatar(c,'{"skin":2,"shirt":1}'::jsonb);
    perform set_config('group_qa.student_'||actor,public.my_profile(c)->>'id',true);
    room:=public.course_room(c);
    if n=1 then
      perform set_config('group_qa.full',room->0->>'id',true);
      perform set_config('group_qa.open',room->1->>'id',true);
      perform set_config('group_qa.empty',room->2->>'id',true);
    end if;
    if n<=6 then
      perform public.choose_topic(c,current_setting(case when n<=5 then 'group_qa.full' else 'group_qa.open' end)::uuid);
    end if;
    if n in (1,6) then perform public.team_chat_send(c,current_setting(case when n=1 then 'group_qa.full' else 'group_qa.open' end)::uuid,'Mensaje de prueba que debe conservarse'); end if;
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.foreign_owner'),true);
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  c:=public.create_course_with_groups('QA otra materia','MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5),1,5);
  perform set_config('group_qa.foreign_course',c::text,true);
  perform set_config('group_qa.foreign_topic',public.teacher_overview(c)->'topics'->0->>'id',true);
end $$;
reset role;
do $$
declare c uuid:=current_setting('group_qa.course')::uuid;
begin
  update public.students set share_contact_with_team=true where course_id=c;
  update public.team_messages set created_at=now()-interval '1 minute' where course_id=c;
  perform set_config('group_qa.before_course',(select to_jsonb(x)::text from public.courses x where id=c),true);
  perform set_config('group_qa.before_students',(select jsonb_agg(to_jsonb(x)-'topic_id'-'share_contact_with_team' order by id)::text from public.students x where course_id=c),true);
  perform set_config('group_qa.before_topics',(select jsonb_agg(to_jsonb(x)-'name'-'instructions'-'join_locked' order by id)::text from public.topics x where course_id=c),true);
  perform set_config('group_qa.before_messages',(select jsonb_agg(to_jsonb(x) order by id)::text from public.team_messages x where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('group_qa.course')::uuid; f uuid:=current_setting('group_qa.full')::uuid;
  o uuid:=current_setting('group_qa.open')::uuid; e uuid:=current_setting('group_qa.empty')::uuid;
  seven uuid:=current_setting('group_qa.student_seven')::uuid; six uuid:=current_setting('group_qa.student_six')::uuid;
  actor text; result jsonb; message text;
begin
  -- Empty and partially occupied groups lock just as full groups do.
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  result:=public.teacher_set_topic_locked(c,o,true);
  if result->>'id'<>o::text or result->>'locked'<>'true' then raise exception 'Lock result mismatch'; end if;
  perform public.teacher_set_topic_locked(c,e,true);
  perform public.teacher_set_topic_locked(c,f,true);
  if not exists(select 1 from jsonb_array_elements(public.teacher_overview(c)->'topics') t where t->>'id'=o::text and (t->>'locked')::boolean) then
    raise exception 'Teacher lock state missing'; end if;
  -- Students cannot bypass a UI lock through direct RPC calls.
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.eight'),true);
  foreach result in array array[jsonb_build_object('id',o),jsonb_build_object('id',e),jsonb_build_object('id',f)] loop
    begin
      perform public.choose_topic(c,(result->>'id')::uuid);
      raise exception 'Locked join accepted';
    exception when raise_exception then
      get stacked diagnostics message=message_text;
      if message not like 'El docente bloqueó%' then raise; end if;
    end;
  end loop;
  if not exists(select 1 from jsonb_array_elements(public.course_room(c)) t where t->>'id'=o::text and (t->>'locked')::boolean) then
    raise exception 'Student lock state missing'; end if;
  -- Original members retain the team and conversation while locked.
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.one'),true);
  if public.my_profile(c)->>'topicId'<>f::text then raise exception 'Lock expelled member'; end if;
  perform public.team_chat_send(c,f,'Mensaje mientras el grupo está bloqueado');
  -- Owner-only exceptions: extra argument cannot grant teacher privileges.
  foreach actor in array array['one','foreign_owner'] loop
    perform set_config('request.jwt.claim.sub',current_setting('group_qa.'||actor),true);
    begin perform public.teacher_assign_student(c,seven,f,true); raise exception 'Non-owner transfer accepted';
      exception when insufficient_privilege then null; end;
    begin perform public.teacher_set_topic_locked(c,f,false); raise exception 'Non-owner unlocked group';
      exception when insufficient_privilege then null; end;
    begin perform private.move_course_student(c,seven,f,true); raise exception 'Private helper bypass';
      exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.teacher_assign_student(c,seven,f,true); raise exception 'Missing auth accepted';
    exception when insufficient_privilege then null; end;
  begin perform public.teacher_set_topic_locked(c,f,false); raise exception 'Missing auth unlocked';
    exception when insufficient_privilege then null; end;
  -- Legacy/default requests still cannot overfill. Explicit false and null too.
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  begin perform public.teacher_move_student(c,seven,f); raise exception 'Implicit exception accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El equipo está completo%' then raise; end if; end;
  begin perform public.teacher_assign_student(c,seven,f,false); raise exception 'False exception accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El equipo está completo%' then raise; end if; end;
  begin perform public.teacher_assign_student(c,seven,f,null); raise exception 'Null exception accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El equipo está completo%' then raise; end if; end;
  -- One unassigned student and one from another team, including an already overfull target.
  perform public.teacher_assign_student(c,seven,f,true);
  perform public.teacher_assign_student(c,six,f,true);
  perform public.teacher_assign_student(c,six,f,true); -- retry is idempotent
  -- Editing text stays possible at 7/5, without increasing the configured capacity.
  perform public.teacher_edit_topic(c,f,'Grupo Coral','Indicaciones revisadas',5);
  begin perform public.teacher_edit_topic(c,f,'Grupo Coral','No reducir',4); raise exception 'Capacity reduced below membership';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'Para cambiar los cupos%' then raise; end if; end;
  -- Cross-course, absent student/topic, and missing lock state stay rejected.
  begin perform public.teacher_assign_student(c,seven,current_setting('group_qa.foreign_topic')::uuid,true); raise exception 'Cross-course destination accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El grupo de destino%' then raise; end if; end;
  begin perform public.teacher_assign_student(c,gen_random_uuid(),f,true); raise exception 'Missing student accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El estudiante no pertenece%' then raise; end if; end;
  begin perform public.teacher_set_topic_locked(c,current_setting('group_qa.foreign_topic')::uuid,true); raise exception 'Cross-course lock accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'Grupo no disponible%' then raise; end if; end;
  begin perform public.teacher_set_topic_locked(c,o,null); raise exception 'Null lock accepted';
    exception when invalid_parameter_value then null; end;
  -- Reopening is independent of occupancy and registration.
  perform public.teacher_set_topic_locked(c,o,false);
  perform public.teacher_set_topic_locked(c,f,false);
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.eight'),true);
  begin perform public.choose_topic(c,f); raise exception 'Student overfilled reopened team';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message<>'El equipo está completo' then raise; end if; end;
  perform public.choose_topic(c,o);
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  perform public.teacher_set_registration(c,false);
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.nine'),true);
  begin perform public.choose_topic(c,o); raise exception 'Closed registration bypassed';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message<>'La elección de equipos está cerrada' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  perform public.teacher_move_student(c,current_setting('group_qa.student_nine')::uuid,e); -- locked/empty, owner still allowed
  perform public.teacher_set_registration(c,true);
end $$;
reset role;
do $$
declare c uuid:=current_setting('group_qa.course')::uuid; f uuid:=current_setting('group_qa.full')::uuid;
  e uuid:=current_setting('group_qa.empty')::uuid; before_messages jsonb:=current_setting('group_qa.before_messages')::jsonb;
begin
  if (select count(*) from public.students where course_id=c and topic_id=f)<>7 then raise exception 'Full group is not exactly 7/5'; end if;
  if (select capacity from public.topics where id=f)<>5 then raise exception 'Exception changed configured capacity'; end if;
  if (select to_jsonb(x) from public.courses x where id=c)<>current_setting('group_qa.before_course')::jsonb then raise exception 'Course or code changed'; end if;
  if (select jsonb_agg(to_jsonb(x)-'topic_id'-'share_contact_with_team' order by id) from public.students x where course_id=c)<>current_setting('group_qa.before_students')::jsonb then
    raise exception 'Profile, identity, avatar or record count changed'; end if;
  if (select jsonb_agg(to_jsonb(x)-'name'-'instructions'-'join_locked' order by id) from public.topics x where course_id=c)<>current_setting('group_qa.before_topics')::jsonb then
    raise exception 'Topic geometry, capacity or history changed'; end if;
  if not (select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.team_messages x where course_id=c) @> before_messages then
    raise exception 'Messages lost or moved'; end if;
  if exists(select 1 from public.students where id in (current_setting('group_qa.student_six')::uuid,current_setting('group_qa.student_seven')::uuid) and share_contact_with_team) then
    raise exception 'Previous phone-sharing permission inherited'; end if;
  if exists(select 1 from public.students where course_id=c and id not in (current_setting('group_qa.student_six')::uuid,current_setting('group_qa.student_seven')::uuid,current_setting('group_qa.student_nine')::uuid) and not share_contact_with_team) then
    raise exception 'Unrelated phone permission changed'; end if;
  -- Archived and disabled subjects remain protected even for the owner.
  update public.topics set archived=true where id=e;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('group_qa.course')::uuid; e uuid:=current_setting('group_qa.empty')::uuid; message text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('group_qa.owner'),true);
  begin perform public.teacher_set_topic_locked(c,e,false); raise exception 'Archived group unlocked';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message<>'Grupo no disponible' then raise; end if; end;
  begin perform public.teacher_assign_student(c,current_setting('group_qa.student_seven')::uuid,e,true); raise exception 'Archived assignment accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'El grupo de destino%' then raise; end if; end;
  perform public.teacher_set_course_active(c,false);
  begin perform public.teacher_set_topic_locked(c,current_setting('group_qa.full')::uuid,true); raise exception 'Disabled course lock changed';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'Restaura la materia%' then raise; end if; end;
  begin perform public.teacher_assign_student(c,current_setting('group_qa.student_seven')::uuid,current_setting('group_qa.open')::uuid,true); raise exception 'Disabled course assignment accepted';
    exception when raise_exception then get stacked diagnostics message=message_text;
      if message not like 'Restaura la materia%' then raise; end if; end;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.teacher_set_topic_locked(uuid,uuid,boolean)','execute')
    or has_function_privilege('anon','public.teacher_assign_student(uuid,uuid,uuid,boolean)','execute')
    or has_function_privilege('anon','private.move_course_student(uuid,uuid,uuid,boolean)','execute')
    or has_table_privilege('authenticated','public.topics','update') then raise exception 'Unexpected privileges'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='teacher_move_student')<>1 then
    raise exception 'Ambiguous RPC overload'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('teacher_set_topic_locked','teacher_move_student','teacher_assign_student','choose_topic') and p.prosecdef) then
    raise exception 'Public wrapper bypasses RLS'; end if;
end $$;
select 'PASS: locks, teacher exceptions, boundaries, ownership, profile/contact/chat preservation' result;
rollback;
