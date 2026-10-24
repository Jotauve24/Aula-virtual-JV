-- Renaming changes only the display name of the existing course.
-- Its ID, access code, code hash, enrollment and team data stay intact.
create function private.rename_course(p_course_id uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(p_name, E' \t\r\n');
  v_result jsonb;
begin
  if v_user is null or not exists (select 1 from public.teachers where user_id = v_user) then
    raise exception 'Acceso docente requerido' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Escribe un nombre de entre 2 y 120 caracteres' using errcode = '22023';
  end if;
  update public.courses c set name = v_name
    where c.id = p_course_id and c.teacher_id = v_user
    returning jsonb_build_object('id', c.id, 'name', c.name) into v_result;
  if not found then
    raise exception 'No tienes acceso a esta materia' using errcode = '42501';
  end if;
  return v_result;
end;
$$;

create function public.teacher_rename_course(p_course_id uuid, p_name text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.rename_course(p_course_id, p_name);
$$;

revoke all on function private.rename_course(uuid,text), public.teacher_rename_course(uuid,text) from public, anon;
grant execute on function private.rename_course(uuid,text), public.teacher_rename_course(uuid,text) to authenticated;
comment on function public.teacher_rename_course(uuid,text) is 'Rename an owned course without changing its code, ID or student/team records.';
notify pgrst, 'reload schema';
