-- The course owner may supervise existing team messages in read-only mode.
-- Students retain their own group-bound write permissions.
create function public.teacher_team_chat_read(p_course_id uuid,p_topic_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_messages jsonb;
begin
  perform private.assert_course_active(p_course_id);
  if not exists (select 1 from public.courses c join public.teachers t on t.user_id=c.teacher_id
    where c.id=p_course_id and c.teacher_id=(select auth.uid())) then
    raise exception 'Acceso docente requerido';
  end if;
  if not exists (select 1 from public.topics t
    where t.course_id=p_course_id and t.id=p_topic_id and not t.archived) then
    raise exception 'Equipo no disponible';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',s.first_name||' '||s.last_name,
    'body',m.body,'senderId',s.id,'mine',false,'createdAt',m.created_at,
    'attachment',case when m.attachment_path is not null then
    jsonb_build_object('path',m.attachment_path,'name',m.attachment_name,
      'size',m.attachment_size,'type',m.attachment_type) else null end)
    order by m.id),'[]'::jsonb) into v_messages
  from (select * from public.team_messages
    where course_id=p_course_id and topic_id=p_topic_id order by id desc limit 50) m
  join public.students s on s.id=m.student_id;
  return v_messages;
end;
$$;
revoke all on function public.teacher_team_chat_read(uuid,uuid) from public,anon;
grant execute on function public.teacher_team_chat_read(uuid,uuid) to authenticated;
