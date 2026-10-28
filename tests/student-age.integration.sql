-- Fictional records only; everything, including auth users, is rolled back.
begin;
do $$
declare actor text; u uuid;
begin
 foreach actor in array array['owner','foreign_owner','new','legacy_document','legacy_both','invalid','outsider'] loop
  u:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,is_anonymous) values(u,'authenticated','authenticated',
   case when actor in ('owner','foreign_owner') then 'age-qa-'||u||'@example.invalid' else null end,actor not in ('owner','foreign_owner'));
  if actor in ('owner','foreign_owner') then insert into public.teachers values(u); end if;
  perform set_config('age_qa.'||actor,u::text,true);
 end loop;
end $$;
set local role authenticated;
do $$
declare suffix text; c uuid; code text; actor text; result jsonb; n int:=0;
begin
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 c:=public.create_course_with_groups('QA edad y exportación',code,2,5);
 perform set_config('age_qa.course',c::text,true);perform set_config('age_qa.code',code,true);
 perform set_config('age_qa.topic',public.teacher_overview(c)->'topics'->0->>'id',true);
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.new'),true);
 perform set_config('age_qa.cedula','8AV-9999-'||(floor(random()*900000)+100000)::integer::text,true);
 result:=public.enroll_student_profile(code,'age-new-'||gen_random_uuid()||'@example.invalid','Ana','Prueba','63000001',
  'cedula',current_setting('age_qa.cedula'),'PA',21);
 if result->>'course_id'<>c::text or public.my_profile(c)->>'age'<>'21' then raise exception 'New age not saved'; end if;
 perform set_config('age_qa.student_new',public.my_profile(c)->>'id',true);
 perform public.save_student_avatar(c,'{"skin":2,"shirt":1,"hair":"long"}');
 perform public.choose_topic(c,current_setting('age_qa.topic')::uuid);
 perform public.team_chat_send(c,current_setting('age_qa.topic')::uuid,'Mensaje ficticio que debe conservarse');
 -- Code-only resume remains compatible and does not clear age.
 perform public.enroll_student_profile(code);
 if public.my_profile(c)->>'age'<>'21' then raise exception 'Resume erased age'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.legacy_document'),true);
 perform set_config('age_qa.passport','00QA'||substr(replace(gen_random_uuid()::text,'-',''),1,16),true);
 perform public.enroll_student_document(code,'age-old-'||gen_random_uuid()||'@example.invalid','Bea','Prueba','63000002',
  'passport',current_setting('age_qa.passport'),'CO');
 perform public.save_student_avatar(c,'{"skin":1,"shirt":1,"hair":"short"}');
 perform public.choose_topic(c,current_setting('age_qa.topic')::uuid);
 perform set_config('age_qa.student_legacy',public.my_profile(c)->>'id',true);
 if public.student_document_status(c)->>'required'<>'false' then raise exception 'Existing document missing'; end if;
 if public.my_profile(c)->'age'<>'null'::jsonb then raise exception 'Age invented for older profile'; end if;
end $$;
reset role;
do $$
declare c uuid:=current_setting('age_qa.course')::uuid; s uuid:=gen_random_uuid();
begin
 insert into public.students(id,course_id,auth_user_id,email,first_name,last_name,original_first_name,original_last_name,
  phone,national_id,avatar,activated_at,topic_id)
 values(s,c,current_setting('age_qa.legacy_both')::uuid,'age-both-'||gen_random_uuid()||'@example.invalid','Ceci','Prueba',
  'Ceci','Prueba','63000003','E-12-345','{"skin":2,"shirt":1,"hair":"short"}',now(),current_setting('age_qa.topic')::uuid);
 perform set_config('age_qa.student_both',s::text,true);
 perform set_config('age_qa.before_students',(select jsonb_agg(to_jsonb(t)-'age' order by id)::text from public.students t where course_id=c),true);
 perform set_config('age_qa.before_course',(select to_jsonb(t)::text from public.courses t where id=c),true);
 perform set_config('age_qa.before_topics',(select jsonb_agg(to_jsonb(t) order by id)::text from public.topics t where course_id=c),true);
 perform set_config('age_qa.before_messages',(select jsonb_agg(to_jsonb(t) order by id)::text from public.team_messages t where course_id=c),true);
 perform set_config('age_qa.before_link',(select to_jsonb(l)::text from private.student_identity_links l where student_id=current_setting('age_qa.student_legacy')::uuid),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('age_qa.course')::uuid; code text:=current_setting('age_qa.code');
 value integer; output jsonb; t jsonb; actor text;
begin
 -- Reject every invalid new age atomically, before any profile is inserted.
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.invalid'),true);
 foreach value in array array[null::integer,-1,0,121] loop
  begin
   perform public.enroll_student_profile(code,'age-invalid-'||gen_random_uuid()||'@example.invalid','Invalida','Prueba','63000009',
    'passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,16),'CO',value);
   raise exception 'Invalid age accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.legacy_document'),true);
 begin perform public.student_complete_registration(c); raise exception 'Missing completion age accepted';
  exception when invalid_parameter_value then null; end;
 foreach value in array array[-1,0,121] loop
  begin perform public.student_complete_registration(c,value); raise exception 'Invalid completion age accepted';
   exception when invalid_parameter_value then null; end;
 end loop;
 -- Closed registration does not block an existing owner's missing fields.
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 perform public.teacher_set_registration(c,false);
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.legacy_document'),true);
 perform public.student_complete_registration(c,34);
 perform public.student_complete_registration(c,99); -- safe retry, existing value must stay 34
 if public.my_profile(c)->>'age'<>'34' then raise exception 'Completion changed saved age'; end if;
 if public.student_document_status(c)->>'required'<>'false' then raise exception 'Age completion lost document'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.legacy_both'),true);
 -- Age and document completion are one transaction; invalid document saves neither.
 begin perform public.student_complete_registration(c,26,'cedula','invalida','PA'); raise exception 'Invalid document accepted';
  exception when raise_exception then if sqlerrm not like 'Revisa la cédula%' then raise; end if; end;
 if public.my_profile(c)->'age'<>'null'::jsonb or public.student_document_status(c)->>'required'<>'true' then
  raise exception 'Failed completion partially saved'; end if;
 perform set_config('age_qa.both_passport','00QA'||substr(replace(gen_random_uuid()::text,'-',''),1,16),true);
 perform public.student_complete_registration(c,26,'passport',current_setting('age_qa.both_passport'),'VE');
 if public.my_profile(c)->>'age'<>'26' or public.student_document_status(c)->>'required'<>'false' then raise exception 'Combined completion failed'; end if;
 -- These fields are absent from peer rosters, even within the same team.
 foreach t in array array[public.course_room(c)] loop
  if exists(select 1 from jsonb_array_elements(t) topic cross join lateral jsonb_array_elements(topic->'members') m
    where m ? 'age' or m ? 'documentNumber' or m ? 'documentType' or m ? 'documentCountry') then
    raise exception 'Private data exposed to classmates'; end if;
 end loop;
 -- Another session or a teacher cannot fill someone else's record via the student API.
 foreach actor in array array['outsider','foreign_owner','owner'] loop
  perform set_config('request.jwt.claim.sub',current_setting('age_qa.'||actor),true);
  begin perform public.student_complete_registration(c,30); raise exception 'Non-student completion accepted';
   exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.student_complete_registration(c,30); raise exception 'No-auth completion accepted';
  exception when insufficient_privilege then null; end;
 begin perform public.enroll_student_profile(code); raise exception 'No-auth enrollment accepted';
  exception when insufficient_privilege then null; end;
 -- Document duplicate guards still apply when age, email and phone are different.
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 perform public.teacher_set_registration(c,true);
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.invalid'),true);
 begin perform public.enroll_student_profile(code,'age-copy-'||gen_random_uuid()||'@example.invalid','Otra','Prueba','63000009',
   'cedula',current_setting('age_qa.cedula'),'PA',55); raise exception 'Duplicate identity accepted';
  exception when raise_exception then if sqlerrm not like 'Este documento ya tiene%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 output:=public.teacher_overview(c);
 if jsonb_array_length(output->'students')<>3 then raise exception 'Rejected registration left an extra row'; end if;
 -- Teacher download receives authoritative identity data, including leading zeros.
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 output:=public.teacher_overview(c);
 if not exists(select 1 from jsonb_array_elements(output->'students') s where s->>'id'=current_setting('age_qa.student_new')
  and s->>'age'='21' and s->>'documentType'='cedula' and s->>'documentCountry'='PA' and s->>'documentNumber'=current_setting('age_qa.cedula')) then
  raise exception 'Cédula or age missing from teacher export'; end if;
 if not exists(select 1 from jsonb_array_elements(output->'students') s where s->>'id'=current_setting('age_qa.student_legacy')
  and s->>'age'='34' and s->>'documentType'='passport' and s->>'documentCountry'='CO' and s->>'documentNumber'=upper(current_setting('age_qa.passport'))) then
  raise exception 'Passport or age missing from teacher export'; end if;
 if not exists(select 1 from jsonb_array_elements(output->'students') s where s->>'id'=current_setting('age_qa.student_both')
  and s->>'documentNumber'=upper(current_setting('age_qa.both_passport')) and s->>'nationalId'='E-12-345') then
  raise exception 'Identity number not preferred over legacy field'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.foreign_owner'),true);
 begin perform public.teacher_overview(c); raise exception 'Foreign teacher saw private age/documents';
  exception when raise_exception then if sqlerrm<>'Acceso denegado' then raise; end if; end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('age_qa.course')::uuid;
begin
 if (select jsonb_agg(to_jsonb(t)-'age' order by id) from public.students t where course_id=c)<>current_setting('age_qa.before_students')::jsonb then
  raise exception 'Age completion changed identity, contact, profile, avatar or membership'; end if;
 if (select to_jsonb(t) from public.courses t where id=c)<>current_setting('age_qa.before_course')::jsonb then raise exception 'Course or code changed'; end if;
 if (select jsonb_agg(to_jsonb(t) order by id) from public.topics t where course_id=c)<>current_setting('age_qa.before_topics')::jsonb then raise exception 'Teams changed'; end if;
 if (select jsonb_agg(to_jsonb(t) order by id) from public.team_messages t where course_id=c)<>current_setting('age_qa.before_messages')::jsonb then raise exception 'Chat changed'; end if;
 if (select to_jsonb(l) from private.student_identity_links l where student_id=current_setting('age_qa.student_legacy')::uuid)<>current_setting('age_qa.before_link')::jsonb then
  raise exception 'Existing document link changed'; end if;
 if has_function_privilege('anon','public.enroll_student_profile(text,text,text,text,text,text,text,text,integer)','execute')
  or has_function_privilege('anon','public.student_complete_registration(uuid,integer,text,text,text)','execute')
  or has_table_privilege('authenticated','private.student_identities','select')
  or has_table_privilege('authenticated','public.students','update') then raise exception 'Unexpected grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('enroll_student_profile','student_complete_registration') and p.prosecdef) then raise exception 'Privileged public wrapper'; end if;
end $$;
set local role authenticated;
do $$
declare value integer; actor text; c uuid:=current_setting('age_qa.course')::uuid;
begin
 foreach value in array array[1,120] loop
  actor:=case when value=1 then 'invalid' else 'outsider' end;
  perform set_config('request.jwt.claim.sub',current_setting('age_qa.'||actor),true);
  perform public.enroll_student_profile(current_setting('age_qa.code'),'age-boundary-'||gen_random_uuid()||'@example.invalid',
   'Limite','Prueba',case when value=1 then '63000011' else '63000012' end,'passport',
   'QA'||substr(replace(gen_random_uuid()::text,'-',''),1,16),'CO',value);
  if public.my_profile(c)->>'age'<>value::text then raise exception 'Valid age boundary not saved'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.owner'),true);
 perform public.teacher_set_course_active(c,false);
 perform set_config('request.jwt.claim.sub',current_setting('age_qa.new'),true);
 begin perform public.student_complete_registration(c,99); raise exception 'Disabled course completion accepted';
  exception when raise_exception then if sqlerrm<>'Materia deshabilitada' then raise; end if; end;
end $$;
reset role;
select 'PASS: age validation, atomic enrollment/completion, teacher export, identity guards and private data' result;
rollback;
