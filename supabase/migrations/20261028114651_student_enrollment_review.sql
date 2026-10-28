-- The observation belongs to one course profile. No flag means no observation,
-- not confirmed institutional enrollment. Existing students start without a flag.
alter table public.students
  add column enrollment_review boolean not null default false;
comment on column public.students.enrollment_review is
  'Teacher observation: enrollment in this subject must be checked. Does not restrict access or certify enrollment.';

create or replace function private.set_student_enrollment_review(
  p_course_id uuid, p_student_id uuid, p_review boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_course public.courses%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso docente requerido' using errcode='42501';
  end if;
  -- Same course-first order as joins, transfers, topic locks and deletion.
  select c.* into v_course from public.courses c
    where c.id=p_course_id and c.teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if not v_course.active then raise exception 'Restaura la materia antes de cambiar las marcas de matrícula'; end if;
  if p_review is null then raise exception 'Indica si deseas marcar o quitar el aviso de matrícula' using errcode='22023'; end if;
  update public.students set enrollment_review=p_review
    where id=p_student_id and course_id=p_course_id;
  if not found then raise exception 'Estudiante no disponible en esta materia'; end if;
  return jsonb_build_object('id',p_student_id,'enrollmentReview',p_review);
end;
$$;

create or replace function public.teacher_set_enrollment_review(
  p_course_id uuid, p_student_id uuid, p_review boolean
) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.set_student_enrollment_review(p_course_id,p_student_id,p_review); $$;

revoke all on function private.set_student_enrollment_review(uuid,uuid,boolean) from public,anon;
revoke all on function public.teacher_set_enrollment_review(uuid,uuid,boolean) from public,anon;
grant execute on function private.set_student_enrollment_review(uuid,uuid,boolean) to authenticated;
grant execute on function public.teacher_set_enrollment_review(uuid,uuid,boolean) to authenticated;

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
    'enrollmentReview', v_student.enrollment_review,
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
      'enrollmentReview', s.enrollment_review,
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

CREATE OR REPLACE FUNCTION public.course_room(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_topic_id uuid; v_teacher boolean;
begin
  perform private.assert_course_active(p_course_id);
  select topic_id into v_topic_id from public.students
    where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  select exists(select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) into v_teacher;
  if v_topic_id is null and not v_teacher and not exists
    (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and phone is not null) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position, 'locked', t.join_locked,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar,
      'email', case when t.id = v_topic_id then s.email else null end,
      'phone', case when t.id = v_topic_id and s.share_contact_with_team then s.phone else null end,
      'mine', s.auth_user_id = (select auth.uid()),
      'enrollmentReview', case when v_teacher or t.id = v_topic_id then s.enrollment_review else null end,
      'sharing', case when s.auth_user_id = (select auth.uid()) then s.share_contact_with_team else null end)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id and not t.archived;
  return v_result;
end;
$function$;

notify pgrst, 'reload schema';
