-- Manual teacher checklist for groups created in their teaching platform.
-- It does not create groups externally, certify enrollment or change membership.
alter table public.topics add column work_group_created boolean not null default false;
comment on column public.topics.work_group_created is
  'Owner-only manual tracking: the teacher has created this work group in their platform. Kept until manually cleared.';

create or replace function private.set_work_group_created(
 p_course_id uuid, p_topic_id uuid, p_created boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_course public.courses%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
 select c.* into v_course from public.courses c
  where c.id=p_course_id and c.teacher_id=(select auth.uid()) for update;
 if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
 if not v_course.active then raise exception 'Restaura la materia antes de cambiar el check del grupo de trabajo'; end if;
 if p_created is null then raise exception 'Indica si el grupo de trabajo está creado' using errcode='22023'; end if;
 update public.topics set work_group_created=p_created
  where id=p_topic_id and course_id=p_course_id and not archived;
 if not found then raise exception 'Grupo no disponible en esta materia'; end if;
 return jsonb_build_object('id',p_topic_id,'workGroupCreated',p_created);
end;
$$;

create or replace function public.teacher_set_work_group_created(
 p_course_id uuid, p_topic_id uuid, p_created boolean
) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.set_work_group_created(p_course_id,p_topic_id,p_created); $$;
revoke all on function private.set_work_group_created(uuid,uuid,boolean) from public,anon;
revoke all on function public.teacher_set_work_group_created(uuid,uuid,boolean) from public,anon;
grant execute on function private.set_work_group_created(uuid,uuid,boolean) to authenticated;
grant execute on function public.teacher_set_work_group_created(uuid,uuid,boolean) to authenticated;

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
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position, 'locked', t.join_locked,
      'workGroupCreated', t.work_group_created)
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

notify pgrst, 'reload schema';
