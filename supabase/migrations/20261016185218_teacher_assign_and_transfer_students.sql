-- The only authenticated owner of a course can assign or transfer its members.
-- Preserve profile, avatar, all historic messages and attachments.
create or replace function public.teacher_move_student(
  p_course_id uuid, p_student_id uuid, p_topic_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_course public.courses%rowtype;
  v_student public.students%rowtype;
  v_topic public.topics%rowtype;
begin
  -- Serializes the last free seat with student choose_topic and other transfers.
  select c.* into v_course from public.courses c
  where c.id = p_course_id and c.teacher_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Acceso denegado';
  end if;
  if not v_course.active then
    raise exception 'Restaura la materia antes de cambiar estudiantes de grupo';
  end if;

  select s.* into v_student from public.students s
  where s.id = p_student_id and s.course_id = p_course_id
  for update;
  if not found then
    raise exception 'El estudiante no pertenece a esta materia';
  end if;

  select t.* into v_topic from public.topics t
  where t.id = p_topic_id and t.course_id = p_course_id and not t.archived;
  if not found then
    raise exception 'El grupo de destino no existe o está deshabilitado';
  end if;

  if v_student.topic_id = v_topic.id then
    return;
  end if;
  if (select count(*) from public.students s
      where s.course_id = p_course_id and s.topic_id = v_topic.id) >= v_topic.capacity then
    raise exception 'El equipo está completo. Elige otro grupo o amplía los cupos';
  end if;

  -- Do not transfer the old group's voluntary contact-sharing permission.
  update public.students
  set topic_id = v_topic.id, share_contact_with_team = false
  where id = v_student.id and course_id = p_course_id;
  -- Original team chat messages remain in their original private conversation.
end;
$$;
revoke all on function public.teacher_move_student(uuid,uuid,uuid) from public, anon;
grant execute on function public.teacher_move_student(uuid,uuid,uuid) to authenticated;
