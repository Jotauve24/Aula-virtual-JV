-- Run after teacher_rename_course. Fixtures are synthetic and rolled back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  student_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (owner_id,'authenticated','authenticated','rename-qa-owner-'||owner_id||'@example.invalid',false),
    (other_id,'authenticated','authenticated','rename-qa-other-'||other_id||'@example.invalid',false),
    (student_id,'authenticated','authenticated',null,true),
    (new_id,'authenticated','authenticated',null,true);
  insert into public.teachers(user_id) values(owner_id),(other_id);
  perform set_config('rename_qa.owner',owner_id::text,true);
  perform set_config('rename_qa.other',other_id::text,true);
  perform set_config('rename_qa.student',student_id::text,true);
  perform set_config('rename_qa.new_student',new_id::text,true);
end $$;
set local role authenticated;
do $$
declare suffix text; code text; course_id uuid; topic_id uuid;
begin
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.owner'),true);
  course_id:=public.create_course_with_groups('QA nombre original',code,1,5);
  perform set_config('rename_qa.course',course_id::text,true);
  perform set_config('rename_qa.code',code,true);
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.student'),true);
  perform public.enroll_student_document(code,'rename-qa-student-'||gen_random_uuid()||'@example.invalid',
    'Ana','Ejemplo','61234567','passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,12),'CO');
  perform public.save_student_avatar(course_id,'{"skin":2,"shirt":1}'::jsonb);
  topic_id:=(public.course_room(course_id)->0->>'id')::uuid;
  perform set_config('rename_qa.topic',topic_id::text,true);
  perform public.choose_topic(course_id,topic_id);
  perform public.team_chat_send(course_id,topic_id,'Mensaje de prueba del equipo');
end $$;
reset role;
do $$
declare c uuid:=current_setting('rename_qa.course')::uuid;
begin
  perform set_config('rename_qa.before_course',(select to_jsonb(x)::text from public.courses x where id=c),true);
  perform set_config('rename_qa.before_students',(select jsonb_agg(to_jsonb(x) order by id)::text from public.students x where course_id=c),true);
  perform set_config('rename_qa.before_topics',(select jsonb_agg(to_jsonb(x) order by id)::text from public.topics x where course_id=c),true);
  perform set_config('rename_qa.before_messages',(select jsonb_agg(to_jsonb(x) order by id)::text from public.team_messages x where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('rename_qa.course')::uuid; result jsonb; actor text; bad_name text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.owner'),true);
  result:=public.teacher_rename_course(c,'  Taller de Informática · Sección B  ');
  if result->>'id'<>c::text or result->>'name'<>'Taller de Informática · Sección B' then
    raise exception 'Rename did not return the saved course identity and trimmed name';
  end if;
  foreach bad_name in array array[null::text,'','  ',E'\t\n','A',repeat('Á',121)] loop
    begin
      perform public.teacher_rename_course(c,bad_name);
      raise exception 'Invalid name accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.teacher_rename_course(gen_random_uuid(),'Materia inexistente');
    raise exception 'Missing course accepted';
  exception when insufficient_privilege then null; end;
  foreach actor in array array[current_setting('rename_qa.student'),current_setting('rename_qa.other'),''] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    begin
      perform public.teacher_rename_course(c,'Cambio no autorizado');
      raise exception 'Non-owner renamed the course';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
do $$
declare c uuid:=current_setting('rename_qa.course')::uuid;
begin
  if (select to_jsonb(x)-'name' from public.courses x where id=c)
      is distinct from (current_setting('rename_qa.before_course')::jsonb-'name') then
    raise exception 'Rename changed the ID, code, owner, dates or enrollment settings';
  end if;
  if (select jsonb_agg(to_jsonb(x) order by id) from public.students x where course_id=c)
      is distinct from current_setting('rename_qa.before_students')::jsonb then raise exception 'Student records changed'; end if;
  if (select jsonb_agg(to_jsonb(x) order by id) from public.topics x where course_id=c)
      is distinct from current_setting('rename_qa.before_topics')::jsonb then raise exception 'Team records changed'; end if;
  if (select jsonb_agg(to_jsonb(x) order by id) from public.team_messages x where course_id=c)
      is distinct from current_setting('rename_qa.before_messages')::jsonb then raise exception 'Chat messages changed'; end if;
  if has_function_privilege('anon','public.teacher_rename_course(uuid,text)','EXECUTE')
    or has_function_privilege('anon','private.rename_course(uuid,text)','EXECUTE')
    or has_table_privilege('authenticated','public.courses','UPDATE') then raise exception 'Privileges widened'; end if;
  if (select prosecdef from pg_proc where oid='public.teacher_rename_course(uuid,text)'::regprocedure) then
    raise exception 'Public wrapper unexpectedly runs as definer'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('rename_qa.course')::uuid; result jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.student'),true);
  result:=public.student_open_owned_course(c);
  if result->>'course_name'<>'Taller de Informática · Sección B' then raise exception 'Student reopening has stale title'; end if;
  perform public.enroll_student_document(current_setting('rename_qa.code'));
  if public.my_profile(c)->>'topicId'<>current_setting('rename_qa.topic') then raise exception 'Returning student lost team'; end if;
  if jsonb_array_length(public.team_chat_read(c,current_setting('rename_qa.topic')::uuid))<>1 then raise exception 'Chat history lost'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.new_student'),true);
  result:=public.enroll_student_document(current_setting('rename_qa.code'),
    'rename-qa-new-'||gen_random_uuid()||'@example.invalid','Luis','Ejemplo','61234568',
    'passport','QB'||substr(replace(gen_random_uuid()::text,'-',''),1,12),'CO');
  if result->>'course_id'<>c::text or result->>'course_name'<>'Taller de Informática · Sección B' then
    raise exception 'Previously shared code no longer opens the same course'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('rename_qa.owner'),true);
  perform public.teacher_set_course_active(c,false);
  perform public.teacher_rename_course(c,'Materia deshabilitada corregida');
end $$;
reset role;
do $$
declare c public.courses%rowtype;
begin
  select * into c from public.courses where id=current_setting('rename_qa.course')::uuid;
  if c.active or c.access_code<>current_setting('rename_qa.code') or c.name<>'Materia deshabilitada corregida' then
    raise exception 'Renaming a disabled course altered its access state'; end if;
end $$;
rollback;
select 'PASS: owner-only rename, validation, stable code/ID, preserved profiles/teams/chat, student reentry and disabled-course support' as result;
