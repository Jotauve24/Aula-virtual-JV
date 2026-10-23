-- Synthetic accounts and courses only. No Auth emails are sent; all rows roll back.
begin;
do $$
declare t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  contact text:='recovery-qa-'||b||'@example.invalid';
begin
  insert into auth.users(id,aud,role,email,is_anonymous,email_confirmed_at) values
    (t,'authenticated','authenticated','recovery-teacher-'||t||'@example.invalid',false,now()),
    (a,'authenticated','authenticated',null,true,null),
    (b,'authenticated','authenticated',contact,false,null),
    (c,'authenticated','authenticated','recovery-other-'||c||'@example.invalid',false,now());
  insert into public.teachers(user_id) values(t);
  perform set_config('qa.recovery_teacher',t::text,true);
  perform set_config('qa.recovery_old',a::text,true);
  perform set_config('qa.recovery_new',b::text,true);
  perform set_config('qa.recovery_other',c::text,true);
  perform set_config('qa.recovery_email',contact,true);
end $$;
set local role authenticated;
do $$
declare course_a uuid; course_b uuid; code_a text; code_b text; suffix text; team uuid; original jsonb;
begin
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code_a:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code_b:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_teacher'),true);
  course_a:=public.create_course_with_groups('QA recovery A',code_a,1,5);
  course_b:=public.create_course_with_groups('QA recovery B',code_b,1,5);
  perform set_config('qa.recovery_course_a',course_a::text,true);
  perform set_config('qa.recovery_course_b',course_b::text,true);
  perform set_config('qa.recovery_code_a',code_a,true);
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_old'),true);
  perform public.enroll_student_document(code_a,current_setting('qa.recovery_email'),'Ana','Recuperacion','60000007','passport','QARECOVER001','PA');
  perform public.enroll_student_document(code_b,current_setting('qa.recovery_email'),'Ana','Recuperacion','60000007','passport','QARECOVER001','PA');
  perform public.save_student_avatar(course_a,'{"skin":2,"shirt":1}'::jsonb);
  team:=(public.course_room(course_a)->0->>'id')::uuid;
  perform public.choose_topic(course_a,team);
  original:=public.my_profile(course_a);
  perform set_config('qa.recovery_profile',original::text,true);
  perform set_config('qa.recovery_team',team::text,true);
  perform public.team_chat_send(course_a,team,'QA mensaje conservado');
  perform public.classroom_presence_ping(course_a,400,300,'down');
  begin
    perform public.student_recover_document_account();
    raise exception 'Anonymous account recovered a document';
  exception when others then
    if sqlerrm not like 'Verifica primero%' then raise;end if;
  end;
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_new'),true);
  begin
    perform public.student_recover_document_account();
    raise exception 'Unverified email recovered a document';
  exception when others then
    if sqlerrm not like 'Verifica primero%' then raise;end if;
  end;
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_other'),true);
  if (public.student_recover_document_account()->>'recovered')::integer<>0 or
    jsonb_array_length(public.student_owned_courses())<>0 then
    raise exception 'Another email acquired the profile';
  end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('qa.recovery_new')::uuid;
set local role authenticated;
do $$
declare result jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_new'),true);
  result:=public.student_recover_document_account();
  if (result->>'recovered')::integer<>1 then raise exception 'Active old session was not protected: %',result;end if;
  result:=public.student_request_profile_recovery(current_setting('qa.recovery_code_a'));
  if result->>'reason' is distinct from 'in_use' then raise exception 'Live profile can be claimed: %',result;end if;
end $$;
reset role;
update private.classroom_presence set seen_at=now()-interval '1 minute'
  where student_id=(current_setting('qa.recovery_profile')::jsonb->>'id')::uuid;
set local role authenticated;
do $$
declare course_a uuid:=current_setting('qa.recovery_course_a')::uuid;
  team uuid:=current_setting('qa.recovery_team')::uuid; original jsonb:=current_setting('qa.recovery_profile')::jsonb;
  result jsonb; messages jsonb; denied boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_new'),true);
  result:=public.student_recover_document_account();
  if (result->>'recovered')::integer<>2 or jsonb_array_length(public.student_owned_courses())<>2 then
    raise exception 'Original subjects were not recovered: %',result;
  end if;
  if public.my_profile(course_a) is distinct from original then raise exception 'Recovery changed profile, team or avatar';end if;
  if public.student_document_status(course_a)->>'required'<>'false' then raise exception 'Document link was lost';end if;
  messages:=public.team_chat_read(course_a,team);
  if not exists(select 1 from jsonb_array_elements(messages) m where m->>'body'='QA mensaje conservado') then
    raise exception 'Recovery lost message access';
  end if;
  perform set_config('request.jwt.claim.sub',current_setting('qa.recovery_old'),true);
  begin perform public.course_room(course_a); exception when others then denied:=true;end;
  if not denied then raise exception 'Previous anonymous owner still accesses the recovered course';end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.students where course_id in
    (current_setting('qa.recovery_course_a')::uuid,current_setting('qa.recovery_course_b')::uuid))<>2 then
    raise exception 'Recovery created a duplicate enrollment';
  end if;
end $$;
select 'PASS: verified recovery preserves document, subjects, avatar, team and chat; active sessions and other emails stay protected' as result;
rollback;
