-- Synthetic fixtures only. Every account, course and enrollment is rolled back.
begin;
do $$
declare t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sample record;
begin
  for sample in select * from (values
    ('60000001','60000001'),('6000-0001','60000001'),('6000 0001','60000001'),
    ('+507 6000-0001','60000001'),('50760000001','60000001'),('0050760000001','60000001'),
    ('+507 200-0001','2000001'),('005072000001','2000001'),
    ('+1 415 555 2671','14155552671'),('',''::text),(null::text,null::text)
  ) fixtures(raw,expected) loop
    if private.registration_phone_key(sample.raw) is distinct from nullif(sample.expected,'') then
      raise exception 'Phone normalization failed for %',sample.raw;
    end if;
  end loop;
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (t,'authenticated','authenticated','contact-qa-'||t||'@example.invalid',false),
    (a,'authenticated','authenticated',null,true),(b,'authenticated','authenticated',null,true),(c,'authenticated','authenticated',null,true);
  insert into public.teachers(user_id) values(t);
  perform set_config('aula.contact_teacher',t::text,true);
  perform set_config('aula.contact_a',a::text,true);
  perform set_config('aula.contact_b',b::text,true);
  perform set_config('aula.contact_c',c::text,true);
end $$;
set local role authenticated;
do $$
declare course_a uuid; course_b uuid; raw text; code_a text; code_b text; digits text; original jsonb; result jsonb; topic uuid;
begin
  digits:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code_a:='MAT-'||substr(digits,1,5)||'-'||substr(digits,6,5)||'-'||substr(digits,11,5);
  digits:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code_b:='MAT-'||substr(digits,1,5)||'-'||substr(digits,6,5)||'-'||substr(digits,11,5);
  perform set_config('request.jwt.claim.sub',current_setting('aula.contact_teacher'),true);
  course_a:=public.create_course_with_groups('QA contact A',code_a,1,5);
  course_b:=public.create_course_with_groups('QA contact B',code_b,1,5);
  perform set_config('aula.contact_course_a',course_a::text,true);
  perform set_config('aula.contact_course_b',course_b::text,true);
  perform set_config('request.jwt.claim.sub',current_setting('aula.contact_a'),true);
  perform public.enroll_student_document(code_a,'first@example.invalid','Ana','Prueba','6000-0001','passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
  perform public.save_student_avatar(course_a,'{"skin":1,"shirt":0,"hair":"short"}'::jsonb);
  topic:=(public.course_room(course_a)->0->>'id')::uuid;
  perform public.choose_topic(course_a,topic);
  original:=public.my_profile(course_a);
  -- Reopening with the original session is idempotent and preserves team/avatar.
  perform public.enroll_student_document(code_a,'changed@example.invalid','Otro','Nombre','6000-0002','passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
  if public.my_profile(course_a) is distinct from original then raise exception 'Existing profile changed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.contact_b'),true);
  if not public.student_registration_phone_hint(code_a,'+507 6000-0001','Ana','Prueba') then
    raise exception 'Matching phone hint missing';
  end if;
  if public.student_registration_phone_hint(code_a,'6000-0001','Otro','Nombre') then
    raise exception 'Hint exposes a different person';
  end if;
  foreach raw in array array['60000001','6000-0001','6000 0001','+507 6000-0001','50760000001','0050760000001'] loop
    begin
      perform public.enroll_student_document(code_a,'new-email@example.invalid','Otro','Nombre',raw,'passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
      raise exception 'Duplicate phone was accepted';
    exception when others then
      if sqlerrm not like 'Este teléfono ya tiene una inscripción%' then raise; end if;
    end;
  end loop;
  begin
    perform public.enroll_student_document(code_a,' FIRST@EXAMPLE.INVALID ','Otro','Nombre','6000-0002','passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
    raise exception 'Duplicate email was accepted';
  exception when others then
    if sqlerrm not like 'Este correo ya tiene una inscripción%' then raise; end if;
  end;
  -- The same contacts are allowed in another subject.
  result:=public.enroll_student_document(code_b,'first@example.invalid','Ana','Prueba','+507 6000-0001','passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
  if result->>'course_id' is distinct from course_b::text then raise exception 'Different subject rejected'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.contact_c'),true);
  perform public.enroll_student_document(code_a,'second@example.invalid','Nueva','Persona','6000-0002','passport','QA'||left(replace(auth.uid()::text,'-',''),20),'PA');
end $$;
reset role;
do $$ begin
  if (select count(*) from public.students where course_id=current_setting('aula.contact_course_a')::uuid)<>2
    or (select count(*) from public.students where course_id=current_setting('aula.contact_course_b')::uuid)<>1 then
    raise exception 'Duplicate checks created unexpected profiles';
  end if;
end $$;
select 'PASS: duplicate email and normalized phone blocked; existing profiles and other subjects preserved' as result;
rollback;
