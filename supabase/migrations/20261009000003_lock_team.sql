-- Un estudiante solo puede elegir un equipo. El docente gestiona cualquier cambio.
create or replace function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_topic public.topics%rowtype; v_student public.students%rowtype;
begin
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección de equipos está cerrada'; end if;
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and phone is not null for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  if v_student.topic_id is not null then
    raise exception 'Ya perteneces a un equipo. Comuníquese con el docente por el mensajero de E-ducativa.';
  end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id;
  if not found then raise exception 'Tema no encontrado'; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id where id = v_student.id;
end;
$$;

create or replace function public.teacher_release_student(p_course_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.courses where id = p_course_id and teacher_id = (select auth.uid())) then
    raise exception 'Acceso denegado';
  end if;
  update public.students set topic_id = null, share_contact_with_team = false
    where id = p_student_id and course_id = p_course_id and topic_id is not null;
  if not found then raise exception 'Estudiante sin equipo o no encontrado'; end if;
end;
$$;
revoke all on function public.teacher_release_student(uuid, uuid) from public, anon;
grant execute on function public.teacher_release_student(uuid, uuid) to authenticated;
