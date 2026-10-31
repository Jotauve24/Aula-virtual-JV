-- Fictional notices and profiles only. No real course is modified; all rows roll back.
begin;
do $$
declare actor text; u uuid; c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); g1 uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid();
begin
  foreach actor in array array['owner','foreign_owner','a','b','outside','recovered'] loop
    u:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,is_anonymous) values(u,'authenticated','authenticated',
      case when actor in ('owner','foreign_owner','recovered') then 'notice-qa-'||u||'@example.invalid' else null end,
      actor not in ('owner','foreign_owner','recovered'));
    if actor in ('owner','foreign_owner') then insert into public.teachers(user_id) values(u); end if;
    perform set_config('notice_qa.'||actor,u::text,true);
  end loop;
  insert into public.courses(id,teacher_id,name,code_hash,active) values
    (c,current_setting('notice_qa.owner')::uuid,'QA avisos de materia',gen_random_uuid()::text,true),
    (c2,current_setting('notice_qa.foreign_owner')::uuid,'QA materia ajena',gen_random_uuid()::text,true);
  insert into public.topics(id,course_id,name,capacity) values(g1,c,'Equipo Coral',5),(g2,c,'Equipo Océano',5);
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone,topic_id)
    values(c,current_setting('notice_qa.a')::uuid,'Ana','Prueba','Ana','Prueba','6500-0001',g1),
      (c,current_setting('notice_qa.b')::uuid,'Luis','Prueba','Luis','Prueba','6500-0002',g2),
      (c2,current_setting('notice_qa.outside')::uuid,'Nora','Prueba','Nora','Prueba','6500-0003',null);
  perform set_config('notice_qa.course',c::text,true); perform set_config('notice_qa.other_course',c2::text,true);
  perform set_config('notice_qa.g1',g1::text,true); perform set_config('notice_qa.g2',g2::text,true);
  perform set_config('notice_qa.all_notice',gen_random_uuid()::text,true);
  perform set_config('notice_qa.team_notice',gen_random_uuid()::text,true);
  perform set_config('notice_qa.student_a',(select id::text from public.students where course_id=c and auth_user_id=current_setting('notice_qa.a')::uuid),true);
  perform set_config('notice_qa.student_snapshot',(select jsonb_agg(to_jsonb(s) order by id)::text from public.students s where course_id=c),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('notice_qa.course')::uuid; n uuid:=current_setting('notice_qa.all_notice')::uuid;
  g uuid:=current_setting('notice_qa.g1')::uuid; actor text; result jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.owner'),true);
  if public.teacher_course_notices(c)<>'[]'::jsonb then raise exception 'New course has notices'; end if;
  perform public.teacher_publish_course_notice(c,n,' Actividad extra ',E'Revisar Educativa.\nUna entrega por grupo.',null);
  perform public.teacher_publish_course_notice(c,n,'Actividad extra',E'Revisar Educativa.\nUna entrega por grupo.',null);
  result:=public.teacher_course_notices(c);
  if jsonb_array_length(result)<>1 or result->0->>'title'<>'Actividad extra'
    or result->0->>'recipientCount'<>'2' or result->0->>'confirmedCount'<>'0' then raise exception 'Publish/idempotence/count failed'; end if;
  begin perform public.teacher_publish_course_notice(c,n,'Otra versión','Mensaje cambiado',null);
    raise exception 'Published text was edited'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),' ','',null);
    raise exception 'Empty notice allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Aviso',repeat('x',4001),null);
    raise exception 'Oversized notice allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_course_notice(current_setting('notice_qa.other_course')::uuid,gen_random_uuid(),'Aviso','Ajeno',null);
    raise exception 'Foreign course changed'; exception when insufficient_privilege then null; end;
  begin perform public.teacher_publish_course_notice(current_setting('notice_qa.other_course')::uuid,gen_random_uuid(),'Aviso','Grupo ajeno',g);
    raise exception 'Foreign scope accepted'; exception when insufficient_privilege then null; end;
  begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Aviso','Grupo inventado',gen_random_uuid());
    raise exception 'Unknown team accepted'; exception when invalid_parameter_value then null; end;
  perform public.teacher_publish_course_notice(c,current_setting('notice_qa.team_notice')::uuid,'Solo Equipo Coral','Indicaciones privadas del equipo.',g);
  foreach actor in array array['foreign_owner','a','outside'] loop
    perform set_config('request.jwt.claim.sub',current_setting('notice_qa.'||actor),true);
    begin perform public.teacher_course_notices(c); raise exception 'Non-owner listed notices'; exception when insufficient_privilege then null; end;
    begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Aviso','No autorizado',null); raise exception 'Non-owner published'; exception when insufficient_privilege then null; end;
    begin perform public.teacher_retire_course_notice(c,n); raise exception 'Non-owner retired notice'; exception when insufficient_privilege then null; end;
    begin perform public.teacher_course_notice_readers(c,n); raise exception 'Read receipts exposed'; exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.a'),true);
  result:=public.student_course_notices(c);
  if jsonb_array_length(result)<>2 or result::text like '%recipientCount%' or result::text like '%studentId%' then raise exception 'Wrong student notice scope or receipts leak'; end if;
  if exists(select 1 from jsonb_array_elements(result) x where x->>'confirmedAt' is not null) then raise exception 'Viewing confirmed the notice'; end if;
  result:=public.student_confirm_course_notice(c,n);
  if result->>'confirmedAt' is null then raise exception 'Read not stored'; end if;
  perform set_config('notice_qa.confirmed_at',result->>'confirmedAt',true);
  if public.student_confirm_course_notice(c,n)->>'confirmedAt'<>current_setting('notice_qa.confirmed_at') then raise exception 'Retry changed confirmation time'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.b'),true);
  result:=public.student_course_notices(c);
  if jsonb_array_length(result)<>1 or result->0->>'confirmedAt' is not null then raise exception 'Team notice leaked or another profile was marked'; end if;
  begin perform public.student_confirm_course_notice(c,current_setting('notice_qa.team_notice')::uuid);
    raise exception 'Other team acknowledged'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.outside'),true);
  begin perform public.student_course_notices(c); raise exception 'Foreign student listed notices'; exception when insufficient_privilege then null; end;
  begin perform public.student_confirm_course_notice(c,n); raise exception 'Foreign student confirmed notice'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.student_course_notices(c); raise exception 'No-session access'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.owner'),true);
  result:=public.teacher_course_notices(c);
  if (select x->>'confirmedCount' from jsonb_array_elements(result) x where x->>'id'=n::text)<>'1'
    or (select x->>'pendingCount' from jsonb_array_elements(result) x where x->>'id'=n::text)<>'1' then raise exception 'Read counts incorrect'; end if;
  result:=public.teacher_course_notice_readers(c,n);
  if jsonb_array_length(result)<>2 or result::text like '%phone%' or result::text like '%email%' then raise exception 'Readers list exposed contacts'; end if;
end $$;
reset role;
do $$
declare c uuid:=current_setting('notice_qa.course')::uuid;
begin
  if (select jsonb_agg(to_jsonb(s) order by id)::text from public.students s where course_id=c)<>current_setting('notice_qa.student_snapshot') then raise exception 'Notice changed profile/avatar/team/contact'; end if;
  -- Simulate the existing recovery flow: the canonical student ID stays the same.
  update public.students set auth_user_id=current_setting('notice_qa.recovered')::uuid where id=current_setting('notice_qa.student_a')::uuid;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('notice_qa.course')::uuid; n uuid:=current_setting('notice_qa.all_notice')::uuid; result jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.recovered'),true);
  result:=public.student_course_notices(c);
  if (select x->>'confirmedAt' from jsonb_array_elements(result) x where x->>'id'=n::text)<>current_setting('notice_qa.confirmed_at') then raise exception 'Recovery/device change lost the read'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.a'),true);
  begin perform public.student_course_notices(c); raise exception 'Old owner still has access'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.owner'),true);
  perform public.teacher_retire_course_notice(c,current_setting('notice_qa.team_notice')::uuid);
  perform public.teacher_retire_course_notice(c,current_setting('notice_qa.team_notice')::uuid);
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.recovered'),true);
  if jsonb_array_length(public.student_course_notices(c))<>1 then raise exception 'Retired notice still delivered'; end if;
  if public.student_confirm_course_notice(c,current_setting('notice_qa.team_notice')::uuid)->>'retired'<>'true' then raise exception 'Retirement race not handled'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.owner'),true);
  for i in 1..9 loop perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Aviso '||i,'Mensaje ficticio',null); end loop;
  begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Límite','Once avisos',null);
    raise exception 'Active notice cap ignored'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$
begin
  update public.courses set active=false where id=current_setting('notice_qa.course')::uuid;
  if exists(select 1 from private.course_notice_reads where notice_id=current_setting('notice_qa.team_notice')::uuid) then raise exception 'Retired notice gained a false receipt'; end if;
  if (select count(*) from private.course_notice_reads where notice_id=current_setting('notice_qa.all_notice')::uuid)<>1 then raise exception 'Receipt duplicated'; end if;
  if has_table_privilege('authenticated','private.course_notices','SELECT')
    or has_table_privilege('authenticated','private.course_notice_reads','INSERT')
    or has_table_privilege('anon','private.course_notices','SELECT') then raise exception 'Unexpected direct table grant'; end if;
  if exists(select 1 from pg_class where oid in ('private.course_notices'::regclass,'private.course_notice_reads'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('teacher_course_notices','teacher_publish_course_notice','teacher_retire_course_notice',
    'teacher_course_notice_readers','student_course_notices','student_confirm_course_notice') and
    (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'Public function elevated or callable without session'; end if;
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('notice_qa.course')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.recovered'),true);
  begin perform public.student_course_notices(c); raise exception 'Disabled notices accessible'; exception when raise_exception then if sqlerrm<>'Materia deshabilitada' then raise; end if; end;
  begin perform public.student_confirm_course_notice(c,current_setting('notice_qa.all_notice')::uuid); raise exception 'Disabled course accepted receipt'; exception when raise_exception then if sqlerrm<>'Materia deshabilitada' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',current_setting('notice_qa.owner'),true);
  begin perform public.teacher_publish_course_notice(c,gen_random_uuid(),'Inactivo','Mensaje',null); raise exception 'Disabled course published'; exception when raise_exception then if sqlerrm<>'Restaura la materia antes de publicar un aviso' then raise; end if; end;
  if jsonb_array_length(public.teacher_course_notices(c))<>11 then raise exception 'History lost'; end if;
end $$;
reset role;
select 'PASS: avisos por materia/equipo, confirmación explícita, recuperación, idempotencia, permisos, retiro, límites y aislamiento' as result;
rollback;
