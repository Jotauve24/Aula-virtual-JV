create function public.teacher_overview(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name,
      'registrationOpen', c.registration_open),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity)
      order by t.created_at), '[]'::jsonb) from public.topics t where t.course_id = c.id),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id,
      'firstName', s.first_name, 'lastName', s.last_name, 'email', s.email,
      'phone', s.phone, 'nationalId', s.national_id, 'activated', s.activated_at is not null,
      'topicId', s.topic_id) order by s.last_name, s.first_name), '[]'::jsonb)
      from public.students s where s.course_id = c.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
      'email', u.email, 'claimedStudentId', r.claimed_student_id,
      'status', r.status) order by r.created_at), '[]'::jsonb)
      from public.claim_requests r join auth.users u on u.id = r.user_id
      where r.course_id = c.id)
    ) into v_result from public.courses c where c.id = p_course_id;
  return v_result;
end;
$$;

create function public.teacher_add_topic(p_course_id uuid, p_name text,
  p_instructions text, p_capacity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  if char_length(trim(p_name)) not between 2 and 80 or
    char_length(p_instructions) > 1000 or p_capacity not between 1 and 100 then
    raise exception 'Revisa el tema y el cupo';
  end if;
  insert into public.topics(course_id,name,instructions,capacity)
    values (p_course_id,trim(p_name),coalesce(p_instructions,''),p_capacity)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.teacher_import_roster(p_course_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_first text; v_last text; v_email text; v_added integer := 0;
begin
  if not exists (select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) then raise exception 'Acceso denegado'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Importa hasta 500 estudiantes por lote';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_first := trim(v_row->>'firstName'); v_last := trim(v_row->>'lastName');
    v_email := nullif(lower(trim(v_row->>'email')), '');
    if char_length(v_first) not between 2 and 80 or
       char_length(v_last) not between 2 and 100 or
       (v_email is not null and (char_length(v_email) > 254 or
         v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$')) then
      raise exception 'Fila inválida en la lista';
    end if;
    if v_email is not null and exists(select 1 from public.students
      where course_id = p_course_id and email = v_email) then
      continue;
    end if;
    insert into public.students(course_id,email,original_first_name,original_last_name,
      first_name,last_name) values (p_course_id,v_email,v_first,v_last,v_first,v_last);
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

create function public.teacher_approve_claim(p_request_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.claim_requests%rowtype; v_email text;
begin
  select r.* into v_request from public.claim_requests r
    join public.courses c on c.id = r.course_id
    where r.id = p_request_id and c.teacher_id = (select auth.uid()) for update of r;
  if not found or v_request.status <> 'pending' then raise exception 'Solicitud no disponible'; end if;
  select lower(email) into v_email from auth.users where id = v_request.user_id;
  update public.students set auth_user_id = v_request.user_id, email = v_email,
    activated_at = now() where id = p_student_id and course_id = v_request.course_id
    and auth_user_id is null and (email is null or lower(email) = v_email);
  if not found then raise exception 'Perfil no disponible para ese correo'; end if;
  update public.claim_requests set status = 'approved' where id = p_request_id;
end;
$$;

create function public.teacher_set_registration(p_course_id uuid, p_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.courses set registration_open = p_open where id = p_course_id
    and teacher_id = (select auth.uid());
  if not found then raise exception 'Acceso denegado'; end if;
end;
$$;

revoke all on function public.teacher_overview(uuid),
  public.teacher_add_topic(uuid,text,text,integer),
  public.teacher_import_roster(uuid,jsonb),
  public.teacher_approve_claim(uuid,uuid),
  public.teacher_set_registration(uuid,boolean) from public, anon;
grant execute on function public.teacher_overview(uuid),
  public.teacher_add_topic(uuid,text,text,integer),
  public.teacher_import_roster(uuid,jsonb),
  public.teacher_approve_claim(uuid,uuid),
  public.teacher_set_registration(uuid,boolean) to authenticated;
