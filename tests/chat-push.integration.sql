-- Fictional accounts and endpoints only. ROLLBACK also cancels pg_net requests.
begin;
do $$
declare actor text; u uuid;
begin
 foreach actor in array array['owner','sender','peer','other'] loop
  u:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,is_anonymous) values(u,'authenticated','authenticated',
   case when actor='owner' then 'push-qa-'||u||'@example.invalid' else null end,actor<>'owner');
  if actor='owner' then insert into public.teachers values(u); end if;
  perform set_config('push_qa.'||actor,u::text,true);
 end loop;
end $$;
set local role authenticated;
do $$
declare c uuid; code text; topic uuid; other_topic uuid; actor text; suffix text; cfg jsonb;
begin
 perform set_config('request.jwt.claim.sub',current_setting('push_qa.owner'),true);
 suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
 code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
 c:=public.create_course_with_groups('QA Web Push ficticio',code,2,5);
 topic:=(public.teacher_overview(c)->'topics'->0->>'id')::uuid;
 other_topic:=(public.teacher_overview(c)->'topics'->1->>'id')::uuid;
 perform set_config('push_qa.course',c::text,true);perform set_config('push_qa.topic',topic::text,true);
 foreach actor in array array['sender','peer','other'] loop
  perform set_config('request.jwt.claim.sub',current_setting('push_qa.'||actor),true);
  perform public.enroll_student_profile(code,'push-qa-'||gen_random_uuid()||'@example.invalid',
   'Persona','Prueba',case actor when 'sender' then '65000011' when 'peer' then '65000012' else '65000013' end,
   'passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,14),'PA',22);
  perform public.save_student_avatar(c,'{"skin":2,"shirt":1,"hair":"short"}');
  perform public.choose_topic(c,case when actor='other' then other_topic else topic end);
  cfg:=public.student_push_config();
  if cfg->>'enabled'<>'true' or cfg ? 'privateKey' then raise exception 'Public configuration invalid'; end if;
  perform public.student_push_subscribe(jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/fictitious-'||actor||'-'||current_setting('push_qa.'||actor),
    'keys',jsonb_build_object('p256dh','B'||repeat('A',86),'auth',repeat('a',22))));
 end loop;
 begin
  perform public.student_push_subscribe('{"endpoint":"https://127.0.0.1/private","keys":{"p256dh":"B","auth":"a"}}');
  raise exception 'SSRF accepted';
 exception when raise_exception then if sqlerrm='SSRF accepted' then raise; end if; end;
 begin
  perform public.chat_push_claim(1,'not-a-token');raise exception 'Student dispatched push';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',current_setting('push_qa.sender'),true);
 perform public.team_chat_send(c,topic,'Mensaje ficticio para comprobar pertenencia');
end $$;
reset role;
do $$
declare message_id bigint; result jsonb; hook text;
begin
 select id into message_id from public.team_messages where course_id=current_setting('push_qa.course')::uuid;
 select decrypted_secret into hook from vault.decrypted_secrets where name='aula_chat_push_hook';
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 begin
  perform public.chat_push_claim(message_id,'wrong');raise exception 'Invalid webhook accepted';
 exception when raise_exception then if sqlerrm='Invalid webhook accepted' then raise; end if; end;
 result:=public.chat_push_claim(message_id,hook);
 if jsonb_array_length(result->'subscriptions')<>1 then raise exception 'Push reached sender or a different team'; end if;
 if result->'subscriptions'->0->>'endpoint' not like '%fictitious-peer-%' then raise exception 'Incorrect recipient'; end if;
 if result ? 'body' or result ? 'email' or result ? 'phone' then raise exception 'Private content in push payload'; end if;
 if public.chat_push_claim(message_id,hook) is not null then raise exception 'Message dispatched twice'; end if;
 perform public.chat_push_finish(message_id,array[result->'subscriptions'->0->>'endpoint'],0,0);
 if exists(select 1 from private.chat_push_subscriptions where auth_user_id=current_setting('push_qa.peer')::uuid) then raise exception 'Expired subscription retained'; end if;
 if not exists(select 1 from private.chat_push_subscriptions where auth_user_id=current_setting('push_qa.other')::uuid) then raise exception 'Different device removed'; end if;
 if has_table_privilege('authenticated','private.chat_push_subscriptions','select') or
    has_function_privilege('anon','public.student_push_config()','execute') or
    has_function_privilege('authenticated','public.chat_push_finish(bigint,text[],integer,integer)','execute') then raise exception 'Push privacy grants invalid'; end if;
end $$;
set local role authenticated;
do $$
begin
 perform set_config('request.jwt.claims','{}',true);
 perform set_config('request.jwt.claim.sub',current_setting('push_qa.sender'),true);
 perform public.student_push_unsubscribe('https://fcm.googleapis.com/fcm/send/fictitious-other-'||current_setting('push_qa.other'));
 perform public.student_push_unsubscribe('https://fcm.googleapis.com/fcm/send/fictitious-sender-'||current_setting('push_qa.sender'));
end $$;
reset role;
do $$
begin
 if exists(select 1 from private.chat_push_subscriptions where auth_user_id=current_setting('push_qa.sender')::uuid) then raise exception 'Unsubscribe failed'; end if;
 if not exists(select 1 from private.chat_push_subscriptions where auth_user_id=current_setting('push_qa.other')::uuid) then raise exception 'Another account unsubscribed'; end if;
end $$;
rollback;
