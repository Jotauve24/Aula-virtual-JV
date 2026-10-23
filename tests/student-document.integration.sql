-- Synthetic data only; requires the document migration. Every fixture is rolled back.
begin;
do $$
declare t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,is_anonymous) values
 (t,'authenticated','authenticated','document-qa-'||t||'@example.invalid',false),
 (a,'authenticated','authenticated',null,true),(b,'authenticated','authenticated',null,true),(c,'authenticated','authenticated',null,true);
 insert into public.teachers(user_id) values(t);
 perform set_config('qa.teacher',t::text,true);perform set_config('qa.a',a::text,true);
 perform set_config('qa.b',b::text,true);perform set_config('qa.c',c::text,true);
end $$;
set local role authenticated;
do $$
declare code_a text; code_b text; code_c text; course_a uuid; course_b uuid; course_c uuid; suffix text; original jsonb; topic uuid; sample text;
begin
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code_a:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code_b:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code_c:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teacher'),true);
 course_a:=public.create_course_with_groups('QA document A',code_a,1,5);
 course_b:=public.create_course_with_groups('QA document B',code_b,1,5);
 course_c:=public.create_course_with_groups('QA document C',code_c,1,5);
 perform set_config('qa.course_a',course_a::text,true);perform set_config('qa.course_b',course_b::text,true);
 perform set_config('qa.course_c',course_c::text,true);perform set_config('qa.code_c',code_c,true);perform set_config('qa.code_a',code_a,true);
 perform set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
 perform public.enroll_student_document(code_a,'one@example.invalid','Ana','Prueba','60000001','cedula','8-9999-999991','PA');
 perform public.save_student_avatar(course_a,'{"skin":2,"shirt":1}'::jsonb);
 topic:=(public.course_room(course_a)->0->>'id')::uuid;
 perform public.choose_topic(course_a,topic);
 original:=public.my_profile(course_a);
 perform public.enroll_student_document(code_a);
 perform public.enroll_student(code_a);
 if public.my_profile(course_a) is distinct from original then raise exception 'Resume altered profile';end if;
 if public.student_document_status(course_a)->>'required'<>'false' then raise exception 'Document missing';end if;
 -- Legitimate existing identity may enroll in another subject.
 perform public.enroll_student_document(code_b,'one@example.invalid','Ana','Prueba','60000001','cedula','8-9999-999991','PA');
 -- A second identity cannot be added to the same auth account.
 begin
  perform public.enroll_student_document(code_c,'other@example.invalid','Ana','Prueba','60000003','passport','QA000001','CO');
  raise exception 'Second document accepted';
 exception when others then if sqlerrm not like 'Tu cuenta ya tiene un documento%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
 foreach sample in array array['8-9999-999991','8 9999 999991','8–9999–999991'] loop
  begin
   perform public.enroll_student_document(code_c,'changed@example.invalid','Otro','Nombre','60000004','cedula',sample,'PA');
   raise exception 'Duplicate document accepted';
  exception when others then if sqlerrm not like 'Este documento ya tiene una cuenta%' then raise;end if;end;
 end loop;
 begin
  perform public.enroll_student(code_c,'old@example.invalid','Otro','Nombre','60000004');
  raise exception 'Old client bypassed document';
 exception when others then if sqlerrm not like 'Completa tu cédula%' then raise;end if;end;
 begin
  perform public.enroll_student_document(code_c,'missing@example.invalid','Otro','Nombre','60000004');
  raise exception 'Missing document accepted';
 exception when others then if sqlerrm not like 'Completa tu cédula%' then raise;end if;end;
 -- Existing email/phone guards remain authoritative.
 begin
  perform public.enroll_student_document(code_a,'one@example.invalid','Otro','Nombre','60000004','passport','QA000002','CO');
  raise exception 'Duplicate email accepted';
 exception when others then if sqlerrm not like 'Este correo ya tiene%' then raise;end if;end;
 begin
  perform public.enroll_student_document(code_a,'other@example.invalid','Otro','Nombre','+507 6000-0001','passport','QA000002','CO');
  raise exception 'Duplicate phone accepted';
 exception when others then if sqlerrm not like 'Este teléfono ya tiene%' then raise;end if;end;
 perform public.enroll_student_document(code_c,'two@example.invalid','Otra','Persona','60000004','passport','qa-000002','CO');
 perform set_config('request.jwt.claim.sub',current_setting('qa.c'),true);
 -- Same passport number from a different issuer is not the same document.
 perform public.enroll_student_document(code_c,'three@example.invalid','Tercera','Persona','60000005','passport','QA000002','VE');
 begin
  perform public.student_set_document(course_a,'cedula','8-9999-999993','PA');
  raise exception 'Another student changed a document';
 exception when others then if sqlerrm not like 'No perteneces%' then raise;end if;end;
end $$;
reset role;
do $$
declare sample record; legacy uuid:=gen_random_uuid(); newuser uuid:=gen_random_uuid(); recovered uuid:=gen_random_uuid();
begin
 for sample in select * from (values
 ('cedula','8-0123-000045','8-123-45'),('cedula','PE 0012 0345','PE-12-345'),
 ('cedula','8AV-123-45','8AV-123-45'),('passport',' ab-001234 ','AB001234')
 ) v(kind,raw,want) loop
  if private.student_document_key(sample.kind,sample.raw)<>sample.want then raise exception 'Normalization failed';end if;
 end loop;
 if private.student_document_key('cedula','8-12-345')=private.student_document_key('cedula','8-123-45') then raise exception 'Ambiguous boundaries merged';end if;
 -- Legacy fixture remains untouched until its authenticated owner completes it.
 insert into auth.users(id,aud,role,is_anonymous) values(newuser,'authenticated','authenticated',true);
 insert into public.students(id,course_id,auth_user_id,email,first_name,last_name,original_first_name,original_last_name,phone,avatar)
 values(legacy,current_setting('qa.course_a')::uuid,newuser,'legacy@example.invalid','Legacy','Persona','Legacy','Persona','60000009','{"skin":3}');
 perform set_config('qa.legacy_user',newuser::text,true);perform set_config('qa.legacy_student',legacy::text,true);
 -- A verified email recovery must retain the document linked to the student row.
 insert into auth.users(id,aud,role,email,is_anonymous,email_confirmed_at)
 values(recovered,'authenticated','authenticated','one@example.invalid',false,now());
 perform set_config('qa.recovered',recovered::text,true);
 if has_table_privilege('authenticated','private.student_identities','SELECT') or has_function_privilege('authenticated','private.enroll_student_contact(text,text,text,text,text)','EXECUTE') then raise exception 'Private access exposed';end if;
end $$;
set local role authenticated;
do $$
declare result jsonb; before_profile jsonb;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.legacy_user'),true);
 before_profile:=public.my_profile(current_setting('qa.course_a')::uuid);
 if public.student_document_status(current_setting('qa.course_a')::uuid)->>'required'<>'true' then raise exception 'Legacy prompt missing';end if;
 perform public.student_set_document(current_setting('qa.course_a')::uuid,'cedula','PE-9999-999993','PA');
 if public.my_profile(current_setting('qa.course_a')::uuid) is distinct from before_profile then raise exception 'Legacy profile changed';end if;
 if public.student_document_status(current_setting('qa.course_a')::uuid)->>'required'<>'false' then raise exception 'Legacy completion missing';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.recovered'),true);
 -- The existing email-based recovery proves ownership, never the document.
 result:=public.student_recover_document_account();
 if (result->>'recovered')::integer<>2 then raise exception 'Global email recovery failed: %',result;end if;
 result:=public.student_request_profile_recovery(current_setting('qa.code_a'));
 if result->>'status' not in ('active','recovered') then raise exception 'Recovery failed: %',result;end if;
 if public.student_document_status(current_setting('qa.course_a')::uuid)->>'required'<>'false' then raise exception 'Recovery lost document';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.student_identity_links where course_id in
 (current_setting('qa.course_a')::uuid,current_setting('qa.course_b')::uuid,current_setting('qa.course_c')::uuid))<>5 then
  raise exception 'Unexpected number of identity links after rejected registrations';end if;
 if has_function_privilege('anon','public.enroll_student_document(text,text,text,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.student_recover_document_account()','EXECUTE') then raise exception 'Anonymous role gained direct API access';end if;
end $$;
select 'PASS: document normalization, global duplicate guard, legacy completion, old-client blocking and private grants' as result;

rollback;
