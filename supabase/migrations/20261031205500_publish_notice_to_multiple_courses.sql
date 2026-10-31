-- One atomic publish across explicitly selected, teacher-owned active courses.
-- Each course keeps its own immutable notice and student read confirmations.
create function private.teacher_publish_notice_to_courses(
  p_course_ids uuid[],p_batch_id uuid,p_title text,p_body text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare ids uuid[]; course uuid; notice uuid; active boolean; result jsonb:='[]'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if p_batch_id is null or p_course_ids is null or cardinality(p_course_ids) not between 1 and 30
    or array_position(p_course_ids,null) is not null then
    raise exception 'Selecciona entre 1 y 30 materias' using errcode='22023';
  end if;
  select array_agg(distinct id order by id) into ids from unnest(p_course_ids) id;
  -- Validate and lock all destinations first, in a stable order. A foreign,
  -- disabled or full-notice course rolls back the complete send.
  foreach course in array ids loop
    select c.active into active from public.courses c
      where c.id=course and c.teacher_id=(select auth.uid()) for update;
    if not found then raise exception 'Una de las materias no está disponible para tu cuenta' using errcode='42501'; end if;
    if not active then raise exception 'Restaura o desmarca las materias deshabilitadas antes de publicar' using errcode='22023'; end if;
  end loop;
  foreach course in array ids loop
    -- The batch and destination deterministically identify a retry. This hash
    -- is a public idempotency key, never an authentication credential.
    notice:=pg_catalog.md5(p_batch_id::text||':'||course::text)::uuid;
    perform private.teacher_publish_course_notice(course,notice,p_title,p_body,null);
    result:=result||jsonb_build_array(jsonb_build_object('courseId',course,'noticeId',notice));
  end loop;
  return result;
end;
$$;
create function public.teacher_publish_notice_to_courses(
  p_course_ids uuid[],p_batch_id uuid,p_title text,p_body text
) returns jsonb language sql security invoker set search_path=''
as $$ select private.teacher_publish_notice_to_courses(p_course_ids,p_batch_id,p_title,p_body); $$;
revoke all on function private.teacher_publish_notice_to_courses(uuid[],uuid,text,text),
  public.teacher_publish_notice_to_courses(uuid[],uuid,text,text) from public,anon;
grant execute on function private.teacher_publish_notice_to_courses(uuid[],uuid,text,text),
  public.teacher_publish_notice_to_courses(uuid[],uuid,text,text) to authenticated;
notify pgrst,'reload schema';
