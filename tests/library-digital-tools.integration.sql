-- Fictional fixtures only; every write is rolled back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); reader_id uuid:=gen_random_uuid();
  source_id uuid:=gen_random_uuid(); enrolled_id uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (owner_id,'authenticated','authenticated',owner_id||'@example.invalid',false),
    (reader_id,'authenticated','authenticated',reader_id||'@example.invalid',true);
  insert into public.teachers(user_id) values(owner_id);
  insert into public.courses(id,teacher_id,name,code_hash,active) values
    (source_id,owner_id,'Herramientas · Prueba ficticia',gen_random_uuid()::text,true),
    (enrolled_id,owner_id,'Lectores · Prueba ficticia',gen_random_uuid()::text,true);
  insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone)
    values(enrolled_id,reader_id,'Ana','Ejemplo','Ana','Ejemplo','6511-0001');
  perform set_config('tools_qa.owner',owner_id::text,true);
  perform set_config('tools_qa.reader',reader_id::text,true);
  perform set_config('tools_qa.course',source_id::text,true);
  perform set_config('tools_qa.post',gen_random_uuid()::text,true);
  perform set_config('tools_qa.marker','tools-qa-'||gen_random_uuid(),true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('tools_qa.course')::uuid;
  p uuid:=current_setting('tools_qa.post')::uuid; marker text:=current_setting('tools_qa.marker'); result jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('tools_qa.owner'),true);
  perform public.course_board_save_post(c,p,0,jsonb_build_object('kind','digital_tool','title',marker,'body','Herramienta para aprender','url','https://example.invalid/herramienta'));
  result:=public.course_board(c,p_kind=>'digital_tool',p_search=>marker);
  if result->>'total'<>'1' or result->'posts'->0->>'kind'<>'digital_tool' then raise exception 'Digital tool was not saved or filtered'; end if;
  perform public.course_board_save_post(c,p,1,jsonb_build_object('kind','digital_tool','title',marker,'body','Descripción actualizada','url','https://example.invalid/herramienta'));
  begin
    perform public.course_board_save_post(c,gen_random_uuid(),0,'{"kind":"unsupported_kind","title":"Inválida","body":"Texto"}');
    raise exception 'Unsupported kind was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.course_board_save_post(c,gen_random_uuid(),0,'{"kind":"digital_tool","title":"Enlace inválido","url":"javascript:alert(1)"}');
    raise exception 'Unsafe link was accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('tools_qa.reader'),true);
  result:=public.shared_library(p_kind=>'digital_tool',p_search=>marker);
  if result->>'total'<>'1' or result->'posts'->0->>'revision'<>'2' then raise exception 'Shared tool was not readable after editing'; end if;
  if public.shared_library(p_kind=>'document',p_search=>marker)->>'total'<>'0' then raise exception 'Tool leaked into another type'; end if;
end $$;
reset role;
select 'Digital tools publish, edit and filter checks passed' as result;
rollback;
