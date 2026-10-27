-- Members may rename their own team; all other group fields stay teacher-only.
create function private.rename_own_team(p_course_id uuid, p_topic_id uuid, p_name text, p_expected_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  v_before text;
begin
  if v_user is null then
    raise exception 'Solo los integrantes pueden cambiar el nombre de su equipo' using errcode = '42501';
  end if;
  -- Same lock order as choosing, moving and editing groups: course, student, topic.
  perform 1 from public.courses where id = p_course_id and active for update;
  if not found then
    raise exception 'La materia no está disponible' using errcode = '42501';
  end if;
  perform 1 from public.students where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = v_user and phone is not null for update;
  if not found then
    raise exception 'Solo puedes cambiar el nombre de tu propio equipo' using errcode = '42501';
  end if;
  select name into v_before from public.topics
    where id = p_topic_id and course_id = p_course_id and not archived for update;
  if not found then
    raise exception 'El equipo no está disponible' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then
    raise exception 'Escribe un nombre de entre 2 y 80 caracteres' using errcode = '22023';
  end if;
  if v_before is distinct from p_expected_name then
    raise exception 'El nombre cambió mientras editabas. Cancela y vuelve a abrir el lápiz para ver el actual.' using errcode = '40001';
  end if;
  if exists(select 1 from public.topics where course_id = p_course_id and id <> p_topic_id
      and not archived and lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) = lower(v_name)) then
    raise exception 'Ya existe un equipo con ese nombre. Elige otro.' using errcode = '22023';
  end if;
  update public.topics set name = v_name where id = p_topic_id and course_id = p_course_id;
  return jsonb_build_object('id', p_topic_id, 'name', v_name);
end;
$$;

create function public.team_rename(p_course_id uuid, p_topic_id uuid, p_name text, p_expected_name text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.rename_own_team(p_course_id, p_topic_id, p_name, p_expected_name);
$$;

revoke all on function private.rename_own_team(uuid,uuid,text,text),
  public.team_rename(uuid,uuid,text,text) from public, anon;
grant execute on function private.rename_own_team(uuid,uuid,text,text),
  public.team_rename(uuid,uuid,text,text) to authenticated;
