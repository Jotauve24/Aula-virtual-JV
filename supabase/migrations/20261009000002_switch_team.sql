-- Permite cambiar de tema mientras el docente mantenga abierta la inscripción.
create or replace function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_topic public.topics%rowtype; v_student public.students%rowtype;
begin
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección de equipos está cerrada'; end if;
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and phone is not null for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id;
  if not found then raise exception 'Tema no encontrado'; end if;
  if v_student.topic_id = p_topic_id then return; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id, share_contact_with_team = false
    where id = v_student.id;
end;
$$;
