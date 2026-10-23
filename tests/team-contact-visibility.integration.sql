-- Synthetic fixtures only; all changes are rolled back.
begin;
do $$
declare t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,is_anonymous) values
 (t,'authenticated','authenticated','team-qa-'||t||'@example.invalid',false),
 (a,'authenticated','authenticated',null,true),(b,'authenticated','authenticated',null,true),
 (c,'authenticated','authenticated',null,true),(d,'authenticated','authenticated',null,true);
 insert into public.teachers(user_id) values(t);
 perform set_config('qa.teamteacher',t::text,true);perform set_config('qa.teama',a::text,true);
 perform set_config('qa.teamb',b::text,true);perform set_config('qa.teamc',c::text,true);perform set_config('qa.teamd',d::text,true);
end $$;
set local role authenticated;
do $$
declare course uuid; code text; suffix text; g1 uuid; g2 uuid; data jsonb; member jsonb;
begin
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamteacher'),true);
 course:=public.create_course_with_groups('QA team visibility',code,2,5);
 perform set_config('qa.teamcourse',course::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teama'),true);
 perform public.enroll_student_document(code,'team-a@example.invalid','Ana','Prueba','60000001','passport','QATEAM00001','PA');
 perform public.save_student_avatar(course,'{"skin":1}'::jsonb);
 data:=public.course_room(course);g1:=(data->0->>'id')::uuid;g2:=(data->1->>'id')::uuid;
 perform public.choose_topic(course,g1);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamb'),true);
 perform public.enroll_student_document(code,'team-b@example.invalid','Beto','Prueba','60000002','passport','QATEAM00002','PA');
 perform public.save_student_avatar(course,'{"skin":1}'::jsonb);
 perform public.choose_topic(course,g1);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamc'),true);
 perform public.enroll_student_document(code,'team-c@example.invalid','Celia','Prueba','60000003','passport','QATEAM00003','PA');
 perform public.save_student_avatar(course,'{"skin":1}'::jsonb);
 perform public.choose_topic(course,g2);
 perform public.team_contact_setting(course,true);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teama'),true);
 data:=public.course_room(course);
 select m into member from jsonb_array_elements(data) t cross join lateral jsonb_array_elements(t->'members') m
 where m->>'name'='Beto Prueba';
 if member->>'email'<>'team-b@example.invalid' or member->>'phone' is not null then raise exception 'Private phone hid email or exposed phone';end if;
 select m into member from jsonb_array_elements(data) t cross join lateral jsonb_array_elements(t->'members') m
 where m->>'name'='Celia Prueba';
 if member->>'email' is not null or member->>'phone' is not null then raise exception 'Other team contacts exposed';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamb'),true);
 perform public.team_contact_setting(course,true);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teama'),true);
 data:=public.course_room(course);
 select m into member from jsonb_array_elements(data) t cross join lateral jsonb_array_elements(t->'members') m
 where m->>'name'='Beto Prueba';
 if member->>'phone'<>'60000002' or member->>'email'<>'team-b@example.invalid' then raise exception 'Phone opt-in failed';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamb'),true);
 perform public.team_contact_setting(course,false);
 perform set_config('request.jwt.claim.sub',current_setting('qa.teama'),true);
 data:=public.course_room(course);
 select m into member from jsonb_array_elements(data) t cross join lateral jsonb_array_elements(t->'members') m
 where m->>'name'='Beto Prueba';
 if member->>'phone' is not null or member->>'email'<>'team-b@example.invalid' then raise exception 'Phone opt-out hid email';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.teamd'),true);
 perform public.enroll_student_document(code,'team-d@example.invalid','Dalia','Prueba','60000004','passport','QATEAM00004','PA');
 data:=public.course_room(course);
 if exists(select 1 from jsonb_array_elements(data) t cross join lateral jsonb_array_elements(t->'members') m
 where m->>'email' is not null or m->>'phone' is not null) then raise exception 'Unassigned student saw contacts';end if;
end $$;
reset role;
select 'PASS: email always visible within own team; phone opt-in only; other teams and unassigned viewers receive neither' as result;
rollback;
