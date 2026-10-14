-- A teacher may remove one unassigned student from a course they own.
-- Storage objects must be removed through the Storage API before the row is deleted.
create or replace function public.teacher_unassigned_student_file_paths(
  p_course_id uuid, p_student_id uuid
) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_paths text[];
begin
  if not exists (select 1 from public.courses c where c.id = p_course_id
    and c.teacher_id = (select auth.uid())) then
    raise exception 'Acceso denegado';
  end if;
  select s.auth_user_id into v_user_id from public.students s
    where s.id = p_student_id and s.course_id = p_course_id and s.topic_id is null;
  if not found then raise exception 'El estudiante ya no está en Sin equipo'; end if;

  select coalesce(array_agg(o.name order by o.name), array[]::text[]) into v_paths
  from storage.objects o where o.bucket_id = 'team-attachments'
    and split_part(o.name, '/', 1) = p_course_id::text
    and ((v_user_id is not null and split_part(o.name, '/', 3) = v_user_id::text)
      or exists (select 1 from public.team_messages m
        where m.course_id = p_course_id and m.student_id = p_student_id
          and m.attachment_path = o.name));
  return v_paths;
end;
$$;

create or replace function public.teacher_delete_unassigned_student(
  p_course_id uuid, p_student_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid;
begin
  if not exists (select 1 from public.courses c where c.id = p_course_id
    and c.teacher_id = (select auth.uid())) then
    raise exception 'Acceso denegado';
  end if;
  select s.id into v_student_id from public.students s
    where s.id = p_student_id and s.course_id = p_course_id and s.topic_id is null for update;
  if v_student_id is null then raise exception 'El estudiante ya no está en Sin equipo'; end if;
  if cardinality(public.teacher_unassigned_student_file_paths(p_course_id, p_student_id)) > 0 then
    raise exception 'Primero retira los archivos de este estudiante';
  end if;
  delete from public.claim_requests r where r.course_id = p_course_id
    and r.claimed_student_id = p_student_id;
  -- Team messages and classroom presence reference students with ON DELETE CASCADE.
  delete from public.students s where s.id = p_student_id and s.course_id = p_course_id
    and s.topic_id is null;
end;
$$;

revoke all on function public.teacher_unassigned_student_file_paths(uuid, uuid),
  public.teacher_delete_unassigned_student(uuid, uuid) from public, anon;
grant execute on function public.teacher_unassigned_student_file_paths(uuid, uuid),
  public.teacher_delete_unassigned_student(uuid, uuid) to authenticated;
