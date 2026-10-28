-- Age is declared in years. Older profiles remain null until their owner
-- completes the missing data; no guessed ages or identity changes.
alter table public.students add column age smallint check (age between 1 and 120);
comment on column public.students.age is 'Age in completed years declared by the student; null on older profiles pending completion.';

create function private.enroll_student_profile(
  p_code text,p_email text,p_first_name text,p_last_name text,p_phone text,
  p_document_type text,p_document_number text,p_document_country text,p_age integer
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  if p_email is not null and (p_age is null or p_age not between 1 and 120) then
    raise exception 'Escribe tu edad en años completos, entre 1 y 120' using errcode='22023';
  end if;
  -- Reuse the authoritative document/email/phone duplicate guard atomically.
  result:=public.enroll_student_document(p_code,p_email,p_first_name,p_last_name,p_phone,
    p_document_type,p_document_number,p_document_country);
  if p_email is not null then
    update public.students set age=p_age where course_id=(result->>'course_id')::uuid
      and auth_user_id=(select auth.uid()) and age is null;
    -- Retries never overwrite an age already saved for the same student.
  end if;
  return result;
end;
$$;
create function public.enroll_student_profile(
  p_code text,p_email text default null,p_first_name text default null,p_last_name text default null,p_phone text default null,
  p_document_type text default null,p_document_number text default null,p_document_country text default null,p_age integer default null
) returns jsonb language sql security invoker set search_path=''
as $$ select private.enroll_student_profile(p_code,p_email,p_first_name,p_last_name,p_phone,
  p_document_type,p_document_number,p_document_country,p_age); $$;

create function private.complete_student_registration(
  p_course_id uuid,p_age integer,p_document_type text,p_document_number text,p_document_country text
) returns void language plpgsql security definer set search_path=''
as $$
declare s public.students%rowtype; document_required boolean;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student:'||(select auth.uid())::text,0));
  perform 1 from public.courses c where c.id=p_course_id and c.active for update;
  if not found then raise exception 'Materia deshabilitada'; end if;
  select t.* into s from public.students t where t.course_id=p_course_id
    and t.auth_user_id=(select auth.uid()) for update;
  if not found then raise exception 'No perteneces a esta materia' using errcode='42501'; end if;
  if (p_age is not null and p_age not between 1 and 120) or (s.age is null and p_age is null) then
    raise exception 'Escribe tu edad en años completos, entre 1 y 120' using errcode='22023';
  end if;
  document_required:=(public.student_document_status(p_course_id)->>'required')::boolean;
  if document_required then
    perform private.bind_student_document(s.id,p_document_type,p_document_country,p_document_number);
  end if;
  if s.age is null then update public.students set age=p_age where id=s.id; end if;
end;
$$;
create function public.student_complete_registration(
  p_course_id uuid,p_age integer default null,p_document_type text default null,
  p_document_number text default null,p_document_country text default null
) returns void language sql security invoker set search_path=''
as $$ select private.complete_student_registration(p_course_id,p_age,p_document_type,p_document_number,p_document_country); $$;

CREATE OR REPLACE FUNCTION public.my_profile(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student public.students%rowtype; v_course public.courses%rowtype;
begin
  perform private.assert_course_active(p_course_id);
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid());
  if not found then raise exception 'Perfil no activado'; end if;
  select * into v_course from public.courses where id = p_course_id;
  return jsonb_build_object('id', v_student.id, 'course', v_course.name,
    'firstName', v_student.first_name, 'lastName', v_student.last_name,
    'nationalId', v_student.national_id, 'phone', v_student.phone, 'age', v_student.age,
    'avatar', v_student.avatar, 'topicId', v_student.topic_id,
    'registrationOpen', v_course.registration_open);
end;
$function$;

CREATE OR REPLACE FUNCTION public.teacher_overview(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name,
      'registrationOpen', c.registration_open, 'active', c.active, 'accessCode', c.access_code),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position, 'locked', t.join_locked)
      order by t.position,t.id), '[]'::jsonb) from public.topics t where t.course_id = c.id and not t.archived),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id,
      'firstName', s.first_name, 'lastName', s.last_name, 'email', s.email,
      'phone', s.phone, 'nationalId', s.national_id, 'age', s.age,
      'documentType', i.document_type, 'documentCountry', i.country,
      'documentNumber', coalesce(i.document_key,s.national_id), 'activated', s.activated_at is not null,
      'topicId', s.topic_id) order by s.last_name, s.first_name), '[]'::jsonb)
      from public.students s
      left join private.student_identity_links l on l.student_id=s.id and l.course_id=c.id
      left join private.student_identities i on i.id=l.identity_id where s.course_id = c.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
      'email', u.email, 'claimedStudentId', r.claimed_student_id,
      'status', r.status) order by r.created_at), '[]'::jsonb)
      from public.claim_requests r join auth.users u on u.id = r.user_id
      where r.course_id = c.id)
    ) into v_result from public.courses c where c.id = p_course_id;
  return v_result;
end;
$function$;

revoke all on function private.enroll_student_profile(text,text,text,text,text,text,text,text,integer) from public,anon;
revoke all on function public.enroll_student_profile(text,text,text,text,text,text,text,text,integer) from public,anon;
revoke all on function private.complete_student_registration(uuid,integer,text,text,text) from public,anon;
revoke all on function public.student_complete_registration(uuid,integer,text,text,text) from public,anon;
grant execute on function private.enroll_student_profile(text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.enroll_student_profile(text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function private.complete_student_registration(uuid,integer,text,text,text) to authenticated;
grant execute on function public.student_complete_registration(uuid,integer,text,text,text) to authenticated;
notify pgrst,'reload schema';
