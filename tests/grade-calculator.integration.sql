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
    perform set_config('grade_qa.'||actor,u::text,true);
  end loop;
  insert into public.courses(id,teacher_id,name,code_hash,active) values
    (c,current_setting('grade_qa.owner')::uuid,'QA calculadora',gen_random_uuid()::text,true),
    (other,current_setting('grade_qa.foreign_owner')::uuid,'QA materia ajena',gen_random_uuid()::text,true);
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone)
    values(c,current_setting('grade_qa.a')::uuid,'Ana','Prueba','Ana','Prueba','6510-0001'),
      (c,current_setting('grade_qa.b')::uuid,'Luis','Prueba','Luis','Prueba','6510-0002'),
      (other,current_setting('grade_qa.outside')::uuid,'Nora','Prueba','Nora','Prueba','6510-0003'),
      (c,current_setting('grade_qa.incomplete')::uuid,'Por','Completar','Por','Completar',null);
  perform set_config('grade_qa.course',c::text,true); perform set_config('grade_qa.other',other::text,true);
  perform set_config('grade_qa.student_a',(select id::text from public.students where course_id=c and auth_user_id=current_setting('grade_qa.a')::uuid),true);
  perform set_config('grade_qa.students_before',(select jsonb_agg(to_jsonb(s) order by s.id)::text from public.students s where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('grade_qa.course')::uuid;
  plan jsonb:='[{"id":"a","name":" Proyecto ","weight":40},{"id":"b","name":"Examen","weight":60}]';
  result jsonb; bad jsonb; actor text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.a'),true);
  result:=public.student_grade_calculator(c);
  if result->'scheme'<>'null'::jsonb or result->'draft'<>'null'::jsonb then raise exception 'Empty course was seeded'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.owner'),true);
  if public.teacher_grade_scheme(c) is not null then raise exception 'New course has scheme'; end if;
  foreach bad in array array['null'::jsonb,'{}'::jsonb,'[]'::jsonb,
    '[{"id":"a","name":"A","weight":99.99}]'::jsonb,
    '[{"id":"a","name":"A","weight":50},{"id":"a","name":"B","weight":50}]'::jsonb,
    '[{"id":"a","name":"A","weight":"100"}]'::jsonb,
    '[{"id":"a","name":"A","weight":0},{"id":"b","name":"B","weight":100}]'::jsonb,
    '[{"id":"a","name":"A","weight":33.333},{"id":"b","name":"B","weight":66.667}]'::jsonb] loop
    begin perform public.teacher_save_grade_scheme(c,bad,71,0); raise exception 'Invalid scheme accepted: %',bad;
      exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.teacher_save_grade_scheme(c,plan,101,0); raise exception 'Invalid reference accepted'; exception when invalid_parameter_value then null; end;
  result:=public.teacher_save_grade_scheme(c,plan,71,0);
  if result->>'revision'<>'1' or result->'activities'->0->>'name'<>'Proyecto' then raise exception 'Publish/normalization failed'; end if;
  begin perform public.teacher_save_grade_scheme(c,plan,71,0); raise exception 'Stale teacher update accepted'; exception when sqlstate 'PT409' then null; end;
  foreach actor in array array['foreign_owner','a','outside','incomplete'] loop
    perform set_config('request.jwt.claim.sub',current_setting('grade_qa.'||actor),true);
    begin perform public.teacher_grade_scheme(c); raise exception 'Foreign user read teacher settings'; exception when insufficient_privilege then null; end;
    begin perform public.teacher_save_grade_scheme(c,plan,80,1); raise exception 'Foreign user changed teacher settings'; exception when insufficient_privilege then null; end;
  end loop;
  foreach actor in array array['owner','outside','incomplete'] loop
    perform set_config('request.jwt.claim.sub',current_setting('grade_qa.'||actor),true);
    begin perform public.student_grade_calculator(c); raise exception 'Nonmember read simulation'; exception when insufficient_privilege then null; end;
    begin perform public.student_save_grade_simulation(c,1,0,'{}',71); raise exception 'Nonmember saved simulation'; exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.a'),true);
  foreach bad in array array['null'::jsonb,'[]'::jsonb,'{"a":null}'::jsonb,'{"a":"80"}'::jsonb,
    '{"a":-1}'::jsonb,'{"a":101}'::jsonb,'{"a":1.234}'::jsonb,'{"unknown":80}'::jsonb] loop
    begin perform public.student_save_grade_simulation(c,1,0,bad,71); raise exception 'Invalid grades accepted: %',bad;
      exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.student_save_grade_simulation(c,1,0,'{}',-1); raise exception 'Invalid goal accepted'; exception when invalid_parameter_value then null; end;
  result:=public.student_save_grade_simulation(c,1,0,'{"a":0}',80.25);
  if result->>'revision'<>'1' then raise exception 'Draft save failed'; end if;
  result:=public.student_grade_calculator(c);
  if result->'draft'->'grades'<>'{"a":0}'::jsonb or (result->'draft'->>'goal')::numeric<>80.25 then raise exception 'Zero/goal lost'; end if;
  begin perform public.student_save_grade_simulation(c,1,0,'{"a":99}',71); raise exception 'Stale device overwrote draft'; exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.b'),true);
  if public.student_grade_calculator(c)->'draft'<>'null'::jsonb then raise exception 'Other student saw private draft'; end if;
  perform public.student_save_grade_simulation(c,1,0,'{"b":90}',71);
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.owner'),true);
  result:=public.teacher_grade_scheme(c);
  if result::text like '%grades%' or result::text like '%goal%' then raise exception 'Teacher RPC exposed personal simulations'; end if;
  perform public.teacher_save_grade_scheme(c,'[{"id":"a","name":"Proyecto","weight":50},{"id":"b","name":"Examen","weight":50}]',71,1);
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.a'),true);
  begin perform public.student_save_grade_simulation(c,1,1,'{"a":80}',71); raise exception 'Old weights accepted'; exception when sqlstate 'PT409' then null; end;
  result:=public.student_grade_calculator(c);
  if result->'scheme'->>'revision'<>'2' or result->'draft'->>'schemeRevision'<>'1' then raise exception 'Scheme revision mismatch hidden'; end if;
  perform public.student_save_grade_simulation(c,2,1,'{"a":80}',71);
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.student_grade_calculator(c); raise exception 'No-session read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('grade_qa.course')::uuid;
begin
  if (select jsonb_agg(to_jsonb(s) order by s.id)::text from public.students s where course_id=c)<>current_setting('grade_qa.students_before') then raise exception 'Calculator changed student profiles'; end if;
  update public.students set auth_user_id=current_setting('grade_qa.recovered')::uuid where id=current_setting('grade_qa.student_a')::uuid;
  if has_table_privilege('authenticated','private.course_grade_schemes','SELECT')
    or has_table_privilege('authenticated','private.student_grade_simulations','SELECT')
    or has_table_privilege('anon','private.student_grade_simulations','INSERT') then raise exception 'Unexpected table grant'; end if;
  if exists(select 1 from pg_class where oid in ('private.course_grade_schemes'::regclass,'private.student_grade_simulations'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'
    and p.proname in ('teacher_grade_scheme','teacher_save_grade_scheme','student_grade_calculator','student_save_grade_simulation')
    and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'Unsafe API function privileges'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('grade_qa.course')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.recovered'),true);
  if public.student_grade_calculator(c)->'draft'->'grades'<>'{"a":80}'::jsonb then raise exception 'Recovery/new device lost draft'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.a'),true);
  begin perform public.student_grade_calculator(c); raise exception 'Old profile owner retained access'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.student_grade_simulations; raise exception 'Direct table read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.courses set active=false where id=current_setting('grade_qa.course')::uuid;
set local role authenticated;
do $$
declare c uuid:=current_setting('grade_qa.course')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.recovered'),true);
  begin perform public.student_grade_calculator(c); raise exception 'Disabled course readable'; exception when raise_exception then if sqlerrm<>'Materia deshabilitada' then raise; end if; end;
  begin perform public.student_save_grade_simulation(c,2,2,'{}',71); raise exception 'Disabled course writable'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('grade_qa.owner'),true);
  begin perform public.teacher_save_grade_scheme(c,'[{"id":"a","name":"A","weight":100}]',71,2); raise exception 'Disabled scheme editable'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
delete from public.courses where id=current_setting('grade_qa.course')::uuid;
do $$ begin
  if exists(select 1 from private.course_grade_schemes where course_id=current_setting('grade_qa.course')::uuid)
    or exists(select 1 from private.student_grade_simulations where student_id=current_setting('grade_qa.student_a')::uuid) then raise exception 'Course deletion left orphaned calculator data'; end if;
end $$;
rollback;
