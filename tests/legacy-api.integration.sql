-- Run against Supabase after applying all migrations. No student data changes.
begin;
do $$
declare role_name text; signature text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach signature in array array[
      'public.request_course(text,uuid)',
      'public.teacher_import_roster(uuid,jsonb)',
      'public.teacher_approve_claim(uuid,uuid)',
      'public.save_my_profile(uuid,text,text,text,text,jsonb)'
    ] loop
      if has_function_privilege(role_name,signature,'EXECUTE') then
        raise exception 'Legacy API still executable: % by %',signature,role_name;
      end if;
    end loop;
  end loop;
  foreach signature in array array[
    'public.enroll_student(text,text,text,text,text)',
    'public.enroll_student_document(text,text,text,text,text,text,text,text)',
    'public.save_student_avatar(uuid,jsonb)',
    'public.student_owned_courses()',
    'public.student_request_profile_recovery(text)',
    'public.student_complete_profile_recovery()'
  ] loop
    if not has_function_privilege('authenticated',signature,'EXECUTE') then
      raise exception 'Current API unexpectedly disabled: %',signature;
    end if;
  end loop;
end $$;
select 'PASS: legacy entry points retired; current student API preserved' as result;
rollback;
