-- Disposable fixtures; no production codes are read or changed.
begin;
do $$
declare t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (t,'authenticated','authenticated','code-qa-'||t||'@example.invalid',false),
    (o,'authenticated','authenticated','code-qa-'||o||'@example.invalid',false),
    (s,'authenticated','authenticated',null,true);
  insert into public.teachers(user_id) values(t),(o);
  perform set_config('aula.code_teacher',t::text,true);
  perform set_config('aula.code_student',s::text,true);
  perform set_config('aula.code_other_teacher',o::text,true);
end $$;
set local role authenticated;
do $$
declare c uuid; info jsonb; denied boolean;
begin
  perform set_config('request.jwt.claim.sub',current_setting('aula.code_teacher'),true);
  c:=public.create_course_with_groups('Code QA temporary','MAT-AAAAA-BBBBB-CCCCC',2,5);
  perform set_config('aula.code_course',c::text,true);
  info:=public.teacher_overview(c);
  if info->'course'->>'accessCode' is distinct from 'MAT-AAAAA-BBBBB-CCCCC' then
    raise exception 'New course code not saved'; end if;
  if public.teacher_generate_course_code(c,'MAT-DDDDD-EEEEE-FFFFF')<>'MAT-AAAAA-BBBBB-CCCCC' then
    raise exception 'Saved code unexpectedly rotated'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.code_other_teacher'),true);
  denied:=false;
  begin perform public.teacher_overview(c); exception when others then denied:=true; end;
  if not denied then raise exception 'Another teacher can read the code'; end if;
  denied:=false;
  begin perform public.teacher_generate_course_code(c,'MAT-DDDDD-EEEEE-FFFFF'); exception when others then denied:=true; end;
  if not denied then raise exception 'Another teacher can replace the code'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.code_student'),true);
  perform public.enroll_student_document('MAT-AAAAA-BBBBB-CCCCC','qa@example.invalid','Prueba','Codigo','6000-0000','passport','QACODE00001','PA');
  perform public.choose_topic(c,(public.course_room(c)->0->>'id')::uuid);
  perform set_config('aula.code_topic',public.my_profile(c)->>'topicId',true);
  denied:=false;
  begin perform public.teacher_overview(c); exception when others then denied:=true; end;
  if not denied then raise exception 'Student can read teacher details'; end if;
  denied:=false;
  begin perform public.teacher_generate_course_code(c,'MAT-DDDDD-EEEEE-FFFFF'); exception when others then denied:=true; end;
  if not denied then raise exception 'Student can generate a teacher code'; end if;
  denied:=false;
  begin perform access_code from public.courses where id=c; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Raw course table is accessible'; end if;
end $$;
reset role;
-- Simulate a legacy course that retained only its hash.
update public.courses set access_code=null where id=current_setting('aula.code_course')::uuid;
set local role authenticated;
do $$
declare c uuid:=current_setting('aula.code_course')::uuid; denied boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',current_setting('aula.code_teacher'),true);
  if public.teacher_overview(c)->'course'->>'accessCode' is not null then raise exception 'Legacy state hidden'; end if;
  if public.teacher_generate_course_code(c,'MAT-DDDDD-EEEEE-FFFFF')<>'MAT-DDDDD-EEEEE-FFFFF' then
    raise exception 'New legacy code not returned'; end if;
  if public.teacher_overview(c)->'course'->>'accessCode'<>'MAT-DDDDD-EEEEE-FFFFF' then
    raise exception 'Legacy code was not saved'; end if;
  if public.teacher_generate_course_code(c,'MAT-GGGGG-HHHHH-JJJJJ')<>'MAT-DDDDD-EEEEE-FFFFF' then
    raise exception 'Retry rotated the code'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('aula.code_student'),true);
  perform public.enroll_student('MAT-DDDDD-EEEEE-FFFFF');
  if public.my_profile(c)->>'topicId' is distinct from current_setting('aula.code_topic') then
    raise exception 'Existing student lost their team'; end if;
  begin perform public.enroll_student('MAT-AAAAA-BBBBB-CCCCC'); exception when others then denied:=true; end;
  if not denied then raise exception 'Old code still grants admission'; end if;
end $$;
reset role;
select 'PASS: saved codes, teacher ownership, student isolation, legacy recovery, idempotency, existing teams' as result;
rollback;
