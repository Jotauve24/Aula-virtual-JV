-- Fictional courses only; the complete test rolls back all rows and identities.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); student_id uuid:=gen_random_uuid(); c uuid; label text;
begin
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (owner_id,'authenticated','authenticated','batch-qa-'||owner_id||'@example.invalid',false),
    (other_id,'authenticated','authenticated','batch-qa-'||other_id||'@example.invalid',false),
    (student_id,'authenticated','authenticated',null,true);
  insert into public.teachers(user_id) values(owner_id),(other_id);
  perform set_config('batch_qa.owner',owner_id::text,true);perform set_config('batch_qa.student',student_id::text,true);
  perform set_config('batch_qa.batch',gen_random_uuid()::text,true);
  foreach label in array array['a','b','disabled','foreign'] loop
    c:=gen_random_uuid();
    insert into public.courses(id,teacher_id,name,code_hash,active)
      values(c,case when label='foreign' then other_id else owner_id end,'QA aviso múltiple '||label,gen_random_uuid()::text,label<>'disabled');
    perform set_config('batch_qa.'||label,c::text,true);
    if label in ('a','b') then
      insert into public.students(course_id,auth_user_id,original_first_name,original_last_name,first_name,last_name,phone)
        values(c,student_id,'Ana','Prueba','Ana','Prueba','6500-0001');
    end if;
  end loop;
end $$;
set local role authenticated;
do $$
declare a uuid:=current_setting('batch_qa.a')::uuid; b uuid:=current_setting('batch_qa.b')::uuid;
  batch uuid:=current_setting('batch_qa.batch')::uuid; result jsonb; first_notice uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('batch_qa.owner'),true);
  result:=public.teacher_publish_notice_to_courses(array[a,b],batch,'Actividad extra','Revisar las indicaciones en Educativa.');
  if jsonb_array_length(result)<>2 then raise exception 'Some destinations missing'; end if;
  perform set_config('batch_qa.notice_a',(select n->>'noticeId' from jsonb_array_elements(result) n where n->>'courseId'=a::text),true);
  perform set_config('batch_qa.notice_b',(select n->>'noticeId' from jsonb_array_elements(result) n where n->>'courseId'=b::text),true);
  if current_setting('batch_qa.notice_a')=current_setting('batch_qa.notice_b') then raise exception 'Course notices share an ID'; end if;
  result:=public.teacher_publish_notice_to_courses(array[b,a,a],batch,'Actividad extra','Revisar las indicaciones en Educativa.');
  if jsonb_array_length(result)<>2 or jsonb_array_length(public.teacher_course_notices(a))<>1
    or jsonb_array_length(public.teacher_course_notices(b))<>1 then raise exception 'Retry or duplicate course created extra notices'; end if;
  begin perform public.teacher_publish_notice_to_courses(array[a,b],batch,'Texto cambiado','Otra versión');
    raise exception 'Existing batch content was changed'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_notice_to_courses(array[a,current_setting('batch_qa.foreign')::uuid],gen_random_uuid(),'Aviso','Ajeno');
    raise exception 'Foreign course accepted'; exception when insufficient_privilege then null; end;
  begin perform public.teacher_publish_notice_to_courses(array[a,current_setting('batch_qa.disabled')::uuid],gen_random_uuid(),'Aviso','Inactivo');
    raise exception 'Disabled course accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_notice_to_courses(array[]::uuid[],gen_random_uuid(),'Aviso','Vacío');
    raise exception 'Empty destinations accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_notice_to_courses(array[a,null],gen_random_uuid(),'Aviso','Nulo');
    raise exception 'Null destination accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.teacher_publish_notice_to_courses(array_fill(a,array[31]),gen_random_uuid(),'Aviso','Exceso');
    raise exception 'Batch limit ignored'; exception when invalid_parameter_value then null; end;
  if jsonb_array_length(public.teacher_course_notices(a))<>1 then raise exception 'Failed send partially published'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('batch_qa.student'),true);
  begin perform public.teacher_publish_notice_to_courses(array[a,b],gen_random_uuid(),'Aviso','Sin permiso');
    raise exception 'Student published batch'; exception when insufficient_privilege then null; end;
  if public.student_course_notices(a)->0->>'confirmedAt' is not null or public.student_course_notices(b)->0->>'confirmedAt' is not null then raise exception 'Publication confirmed reads automatically'; end if;
  perform public.student_confirm_course_notice(a,current_setting('batch_qa.notice_a')::uuid);
  if public.student_course_notices(a)->0->>'confirmedAt' is null or public.student_course_notices(b)->0->>'confirmedAt' is not null then raise exception 'Read confirmation crossed course boundary'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('batch_qa.owner'),true);
  for i in 1..9 loop perform public.teacher_publish_course_notice(b,gen_random_uuid(),'Aviso '||i,'Mensaje ficticio',null); end loop;
  begin perform public.teacher_publish_notice_to_courses(array[a,b],gen_random_uuid(),'Sin cupo','Prueba de atomicidad');
    raise exception 'Course notice cap ignored'; exception when invalid_parameter_value then null; end;
  if jsonb_array_length(public.teacher_course_notices(a))<>1 then raise exception 'Quota failure left a partial publication'; end if;
end $$;
reset role;
do $$
begin
  if exists(select 1 from private.course_notices where course_id in (current_setting('batch_qa.disabled')::uuid,current_setting('batch_qa.foreign')::uuid)) then raise exception 'Unauthorized/inactive course changed'; end if;
  if has_function_privilege('anon','public.teacher_publish_notice_to_courses(uuid[],uuid,text,text)','EXECUTE')
    or (select prosecdef from pg_proc where oid='public.teacher_publish_notice_to_courses(uuid[],uuid,text,text)'::regprocedure) then raise exception 'Incorrect public permissions'; end if;
end $$;
select 'PASS: publicación atómica por materias propias, reintentos, permisos, límites y lecturas independientes' as result;
rollback;
