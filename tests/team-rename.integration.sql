-- Synthetic identities and all fixture data are rolled back; no email is sent.
begin;
do $$
declare actor text; user_id uuid;
begin
  foreach actor in array array['owner','member','peer','other_team','outsider'] loop
    user_id := gen_random_uuid();
    insert into auth.users(id,aud,role,email,is_anonymous) values
      (user_id,'authenticated','authenticated',case when actor='owner' then 'team-qa-'||user_id||'@example.invalid' else null end,actor<>'owner');
    if actor='owner' then insert into public.teachers values(user_id); end if;
    perform set_config('team_qa.'||actor,user_id::text,true);
  end loop;
end $$;
set local role authenticated;
do $$
declare suffix text; code text; course_id uuid; room jsonb; actor text; n integer:=0;
begin
  suffix:=translate(upper(replace(gen_random_uuid()::text,'-','')),'01','AB');
  code:='MAT-'||substr(suffix,1,5)||'-'||substr(suffix,6,5)||'-'||substr(suffix,11,5);
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.owner'),true);
  course_id:=public.create_course_with_groups('QA nombres de equipo',code,2,5);
  perform set_config('team_qa.course',course_id::text,true);
  foreach actor in array array['member','peer','other_team'] loop
    n:=n+1;
    perform set_config('request.jwt.claim.sub',current_setting('team_qa.'||actor),true);
    perform public.enroll_student_document(code,'team-qa-'||gen_random_uuid()||'@example.invalid',
      'Persona','Ejemplo '||n,'6123456'||n,'passport','QA'||substr(replace(gen_random_uuid()::text,'-',''),1,12),'CO');
    perform public.save_student_avatar(course_id,'{"skin":2,"shirt":1}'::jsonb);
    room:=public.course_room(course_id);
    if actor='member' then
      perform set_config('team_qa.topic',room->0->>'id',true);
      perform set_config('team_qa.original',room->0->>'name',true);
      perform set_config('team_qa.other_topic',room->1->>'id',true);
      perform set_config('team_qa.other_name',room->1->>'name',true);
    end if;
    perform public.choose_topic(course_id,(current_setting(case when actor='other_team' then 'team_qa.other_topic' else 'team_qa.topic' end))::uuid);
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.member'),true);
  perform public.team_chat_send(course_id,current_setting('team_qa.topic')::uuid,'Mensaje ficticio que debe conservarse');
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.owner'),true);
  perform public.teacher_set_registration(course_id,false);
end $$;
reset role;
do $$
declare c uuid:=current_setting('team_qa.course')::uuid;
begin
  perform set_config('team_qa.before_course',(select to_jsonb(x)::text from public.courses x where id=c),true);
  perform set_config('team_qa.before_students',(select jsonb_agg(to_jsonb(x) order by id)::text from public.students x where course_id=c),true);
  perform set_config('team_qa.before_topics',(select jsonb_agg(to_jsonb(x)-'name' order by id)::text from public.topics x where course_id=c),true);
  perform set_config('team_qa.before_messages',(select jsonb_agg(to_jsonb(x) order by id)::text from public.team_messages x where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('team_qa.course')::uuid; t uuid:=current_setting('team_qa.topic')::uuid;
  saved jsonb; bad text; actor text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.member'),true);
  saved:=public.team_rename(c,t,E'  Equipo\tCreativo  ',current_setting('team_qa.original'));
  if saved->>'id'<>t::text or saved->>'name'<>'Equipo Creativo' then raise exception 'Saved identity/name mismatch'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.peer'),true);
  if not exists(select 1 from jsonb_array_elements(public.course_room(c)) r where r->>'id'=t::text and r->>'name'='Equipo Creativo') then
    raise exception 'Teammates see a stale name'; end if;
  perform public.team_rename(c,t,'Equipo Coral','Equipo Creativo');
  foreach bad in array array[null::text,'',' ',E'\t\n','A',repeat('Á',81)] loop
    begin
      perform public.team_rename(c,t,bad,'Equipo Coral');
      raise exception 'Invalid name accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.team_rename(c,t,lower(current_setting('team_qa.other_name')),'Equipo Coral');
    raise exception 'Duplicate team name accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.team_rename(c,t,'Cambio desactualizado','Equipo Creativo');
    raise exception 'Stale name overwrote another member';
  exception when serialization_failure then null; end;
  foreach actor in array array['other_team','outsider','owner'] loop
    perform set_config('request.jwt.claim.sub',current_setting('team_qa.'||actor),true);
    begin
      perform public.team_rename(c,t,'Cambio no autorizado','Equipo Coral');
      raise exception 'Non-member renamed team';
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.member'),true);
  begin
    perform public.team_rename(gen_random_uuid(),t,'Otra materia','Equipo Coral');
    raise exception 'Cross-course rename accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.team_rename(c,current_setting('team_qa.other_topic')::uuid,'Otro equipo',current_setting('team_qa.other_name'));
    raise exception 'Cross-team rename accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.team_rename(c,t,'Sin versión previa',null);
    raise exception 'Missing expected name accepted';
  exception when serialization_failure then null; end;
  perform public.team_rename(c,t,repeat('Á',80),'Equipo Coral');
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.team_rename(c,t,'Sin sesión',repeat('Á',80));
    raise exception 'Missing auth identity accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare c uuid:=current_setting('team_qa.course')::uuid;
begin
  if (select to_jsonb(x) from public.courses x where id=c) is distinct from current_setting('team_qa.before_course')::jsonb then raise exception 'Course/code/settings changed'; end if;
  if (select jsonb_agg(to_jsonb(x) order by id) from public.students x where course_id=c) is distinct from current_setting('team_qa.before_students')::jsonb then raise exception 'Membership/avatar/contact changed'; end if;
  if (select jsonb_agg(to_jsonb(x)-'name' order by id) from public.topics x where course_id=c) is distinct from current_setting('team_qa.before_topics')::jsonb then raise exception 'Group ID/order/capacity/instructions changed'; end if;
  if (select jsonb_agg(to_jsonb(x) order by id) from public.team_messages x where course_id=c) is distinct from current_setting('team_qa.before_messages')::jsonb then raise exception 'Chat changed'; end if;
  if (select name from public.topics where id=current_setting('team_qa.other_topic')::uuid) <> current_setting('team_qa.other_name') then raise exception 'Other group changed'; end if;
  if has_function_privilege('anon','public.team_rename(uuid,uuid,text,text)','EXECUTE') or
     has_function_privilege('anon','private.rename_own_team(uuid,uuid,text,text)','EXECUTE') or
     has_table_privilege('authenticated','public.topics','UPDATE') then raise exception 'Privileges widened'; end if;
  if (select prosecdef from pg_proc where oid='public.team_rename(uuid,uuid,text,text)'::regprocedure) then raise exception 'Public function is a definer'; end if;
  update public.topics set archived=true where id=current_setting('team_qa.topic')::uuid;
end $$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.member'),true);
  begin
    perform public.team_rename(current_setting('team_qa.course')::uuid,current_setting('team_qa.topic')::uuid,'Equipo archivado',repeat('Á',80));
    raise exception 'Archived team accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.courses set active=false where id=current_setting('team_qa.course')::uuid;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('team_qa.member'),true);
  begin
    perform public.team_rename(current_setting('team_qa.course')::uuid,current_setting('team_qa.topic')::uuid,'Materia deshabilitada',repeat('Á',80));
    raise exception 'Inactive course accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: member-only team rename; validation, conflict, duplicate/cross-team guards; stable group/course/student/chat data; inactive/archived guards; fixtures rolled back' as result;
