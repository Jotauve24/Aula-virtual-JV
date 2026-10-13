-- Materias deshabilitadas pueden restaurarse; eliminar requiere retirar antes archivos Storage.
alter table public.courses add column active boolean not null default true;

create or replace function private.assert_course_active(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.courses where id=p_course_id and active) then
    raise exception 'Materia deshabilitada';
  end if;
end;
$$;
revoke all on function private.assert_course_active(uuid) from public, anon, authenticated;

create or replace function public.teacher_disabled_courses()
returns table (id uuid, name text, registration_open boolean, student_count bigint, topic_count bigint)
language sql security definer set search_path = '' as $$
  select c.id, c.name, c.registration_open,
    (select count(*) from public.students s where s.course_id=c.id),
    (select count(*) from public.topics t where t.course_id=c.id and not t.archived)
  from public.courses c where c.teacher_id=(select auth.uid()) and not c.active
  order by c.created_at desc;
$$;

create or replace function public.teacher_set_course_active(p_course_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_active is null then raise exception 'Estado inválido'; end if;
  update public.courses set active=p_active where id=p_course_id and teacher_id=(select auth.uid());
  if not found then raise exception 'Materia no disponible'; end if;
end;
$$;

create or replace function public.teacher_course_file_paths(p_course_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_paths text[];
begin
  if not exists (select 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid())) then
    raise exception 'Acceso denegado';
  end if;
  select coalesce(array_agg(o.name order by o.name),array[]::text[]) into v_paths
    from storage.objects o where o.bucket_id='team-attachments' and o.name like (p_course_id::text||'/%');
  return v_paths;
end;
$$;

create or replace function public.teacher_delete_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_active boolean;
begin
  select active into v_active from public.courses where id=p_course_id
    and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Materia no disponible'; end if;
  if v_active then raise exception 'Deshabilita la materia antes de eliminarla'; end if;
  if exists (select 1 from storage.objects where bucket_id='team-attachments'
    and name like (p_course_id::text||'/%')) then
    raise exception 'Primero retira los archivos de esta materia';
  end if;
  -- Los mensajes dependen de estudiantes y se retiran por cascada; los temas y solicitudes
  -- dependen de courses y se retiran por cascada. Borramos estudiantes primero para
  -- satisfacer la referencia compuesta estudiantes -> temas.
  delete from public.students where course_id=p_course_id;
  delete from public.courses where id=p_course_id and teacher_id=(select auth.uid());
end;
$$;

create or replace function private.teacher_file_access(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.courses c where c.id::text=split_part(p_path,'/',1)
    and c.teacher_id=(select auth.uid()));
$$;
create policy team_attachment_teacher_read on storage.objects for select to authenticated
  using (bucket_id='team-attachments' and private.teacher_file_access(name));
create policy team_attachment_teacher_delete on storage.objects for delete to authenticated
  using (bucket_id='team-attachments' and private.teacher_file_access(name));

revoke all on function private.teacher_file_access(text),
  public.teacher_disabled_courses(),public.teacher_set_course_active(uuid,boolean),
  public.teacher_course_file_paths(uuid),public.teacher_delete_course(uuid) from public,anon;
grant execute on function private.teacher_file_access(text),
  public.teacher_disabled_courses(),public.teacher_set_course_active(uuid,boolean),
  public.teacher_course_file_paths(uuid),public.teacher_delete_course(uuid) to authenticated;

-- Preserve the current function bodies and add the active-course guard.
CREATE OR REPLACE FUNCTION public.my_courses()
 RETURNS TABLE(id uuid, name text, registration_open boolean, student_count bigint, topic_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.name, c.registration_open,
    (select count(*) from public.students s where s.course_id = c.id),
    (select count(*) from public.topics t where t.course_id = c.id and not t.archived)
  from public.courses c where c.teacher_id = (select auth.uid()) and c.active
  order by c.created_at desc;
$function$;

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
      'name', t.name, 'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position)
      order by t.position,t.id), '[]'::jsonb) from public.topics t where t.course_id = c.id and not t.archived),
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
$function$;

CREATE OR REPLACE FUNCTION public.enroll_student(p_code text, p_email text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_course public.courses%rowtype; v_student public.students%rowtype;
  v_email text; v_phone text;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
  if p_code is null or char_length(p_code) > 48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses where code_hash =
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code, '[[:space:]]', '', 'g')), 'UTF8')), 'hex')
    and active for update;
  if not found then raise exception 'Materia no encontrada'; end if;
  select * into v_student from public.students
    where course_id = v_course.id and auth_user_id = (select auth.uid());
  if found then
    return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
  end if;
  if not v_course.registration_open then raise exception 'La inscripción está cerrada'; end if;
  if (select count(*) from public.students where course_id = v_course.id) >= 500 then
    raise exception 'La materia alcanzó el límite de estudiantes'; end if;
  v_email := lower(trim(p_email)); v_phone := trim(p_phone);
  if v_email is null or p_first_name is null or p_last_name is null or
     v_phone is null or char_length(v_email) not between 5 and 254 or
     v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' or
     char_length(trim(p_first_name)) not between 2 and 80 or
     char_length(trim(p_last_name)) not between 2 and 100 or
     v_phone !~ '^\+?[0-9 -]{7,20}$' or
     char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Revisa correo, nombre, apellido y teléfono';
  end if;
  insert into public.students(course_id, email, auth_user_id, original_first_name,
    original_last_name, first_name, last_name, phone, activated_at)
    values (v_course.id, v_email, (select auth.uid()), trim(p_first_name),
      trim(p_last_name), trim(p_first_name), trim(p_last_name), v_phone, now());
  return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_course(p_code text, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_course public.courses%rowtype; v_email text; v_student public.students%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión primero'; end if;
  if p_code is null or char_length(p_code) > 48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses
    where code_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code, '[[:space:]]', '', 'g')), 'UTF8')), 'hex') and active;
  if not found then raise exception 'Materia no encontrada'; end if;
  v_email := lower((select email from auth.users where id = (select auth.uid())));
  select * into v_student from public.students
    where course_id = v_course.id and auth_user_id = (select auth.uid());
  if found then
    return jsonb_build_object('status', 'active', 'course_id', v_course.id,
      'course_name', v_course.name);
  end if;
  -- La coincidencia con un correo previamente asignado identifica un perfil.
  -- Un nombre elegido sin correo requiere aprobación del docente.
  select * into v_student from public.students
    where course_id = v_course.id and lower(email) = v_email and auth_user_id is null
    for update;
  if found then
    update public.students set auth_user_id = (select auth.uid()), activated_at = now()
      where id = v_student.id;
    return jsonb_build_object('status', 'active', 'course_id', v_course.id,
      'course_name', v_course.name);
  end if;
  if p_student_id is not null and not exists
    (select 1 from public.students where id = p_student_id and course_id = v_course.id
      and auth_user_id is null) then
    raise exception 'Perfil no disponible';
  end if;
  insert into public.claim_requests(course_id, user_id, claimed_student_id)
    values (v_course.id, (select auth.uid()), p_student_id)
    on conflict (course_id, user_id) do update set
      claimed_student_id = excluded.claimed_student_id,
      status = 'pending';
  return jsonb_build_object('status', 'pending', 'course_id', v_course.id,
    'course_name', v_course.name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_profile(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student public.students%rowtype; v_course public.courses%rowtype;
begin
  perform private.assert_course_active(p_course_id);
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid());
  if not found then raise exception 'Perfil no activado'; end if;
  select * into v_course from public.courses where id = p_course_id;
  return jsonb_build_object('id', v_student.id, 'course', v_course.name,
    'firstName', v_student.first_name, 'lastName', v_student.last_name,
    'nationalId', v_student.national_id, 'phone', v_student.phone,
    'avatar', v_student.avatar, 'topicId', v_student.topic_id,
    'registrationOpen', v_course.registration_open);
end;
$function$;

CREATE OR REPLACE FUNCTION public.course_room(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_topic_id uuid; v_teacher boolean;
begin
  perform private.assert_course_active(p_course_id);
  select topic_id into v_topic_id from public.students
    where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  select exists(select 1 from public.courses where id = p_course_id
    and teacher_id = (select auth.uid())) into v_teacher;
  if v_topic_id is null and not v_teacher and not exists
    (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and phone is not null) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity, 'position', t.position,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar,
      'email', case when t.id = v_topic_id and s.share_contact_with_team then s.email else null end,
      'phone', case when t.id = v_topic_id and s.share_contact_with_team then s.phone else null end,
      'mine', s.auth_user_id = (select auth.uid()),
      'sharing', case when s.auth_user_id = (select auth.uid()) then s.share_contact_with_team else null end)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id and not t.archived;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.choose_topic(p_course_id uuid, p_topic_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_topic public.topics%rowtype; v_student public.students%rowtype;
begin
  perform private.assert_course_active(p_course_id);
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección de equipos está cerrada'; end if;
  select * into v_student from public.students where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and phone is not null for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  if v_student.topic_id is not null then
    raise exception 'Ya perteneces a un equipo. Comuníquese con el docente por el mensajero de E-ducativa.';
  end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id and not archived;
  if not found then raise exception 'Tema no encontrado'; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id where id = v_student.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_student_avatar(p_course_id uuid, p_avatar jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_course_active(p_course_id);
  if jsonb_typeof(p_avatar) <> 'object' or
     p_avatar->>'skin' not in ('0','1','2') or
     p_avatar->>'shirt' not in ('0','1','2') or
     p_avatar->>'hair' not in ('short','long','curly') or
     pg_catalog.octet_length(p_avatar::text) > 256 then
    raise exception 'Revisa el avatar';
  end if;
  update public.students set avatar = p_avatar where course_id = p_course_id
    and auth_user_id = (select auth.uid());
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_profile(p_course_id uuid, p_first_name text, p_last_name text, p_national_id text, p_phone text, p_avatar jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_course_active(p_course_id);
  if char_length(trim(p_first_name)) not between 2 and 80 or
     char_length(trim(p_last_name)) not between 2 and 100 or
     char_length(trim(p_national_id)) not between 4 and 32 or
     p_phone !~ '^[0-9]{4}-[0-9]{4}$' or
     jsonb_typeof(p_avatar) <> 'object' or
     pg_catalog.octet_length(p_avatar::text) > 1024 then
    raise exception 'Revisa los datos del perfil';
  end if;
  update public.students set first_name = trim(p_first_name), last_name = trim(p_last_name),
    national_id = trim(p_national_id), phone = p_phone, avatar = p_avatar
    where course_id = p_course_id and auth_user_id = (select auth.uid());
  if not found then raise exception 'Perfil no activado'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_contact_setting(p_course_id uuid, p_share boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_course_active(p_course_id);
  update public.students set share_contact_with_team = coalesce(p_share, false)
  where course_id = p_course_id and auth_user_id = (select auth.uid()) and phone is not null;
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_chat_read(p_course_id uuid, p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student_id uuid; v_messages jsonb;
begin
  perform private.assert_course_active(p_course_id);
  select id into v_student_id from public.students
  where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = (select auth.uid()) and phone is not null;
  if v_student_id is null then raise exception 'Solo tu equipo puede leer esta conversación'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', s.first_name || ' ' || s.last_name,
    'body', m.body, 'senderId', s.id, 'attachment', case when m.attachment_path is not null then jsonb_build_object('path',m.attachment_path,'name',m.attachment_name,'size',m.attachment_size,'type',m.attachment_type) else null end, 'mine', m.student_id = v_student_id, 'createdAt', m.created_at)
    order by m.id), '[]'::jsonb) into v_messages
  from (select * from public.team_messages where course_id = p_course_id
    and topic_id = p_topic_id order by id desc limit 50) m
  join public.students s on s.id = m.student_id;
  return v_messages;
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_chat_send(p_course_id uuid, p_topic_id uuid, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student_id uuid; v_body text := trim(p_body);
begin
  perform private.assert_course_active(p_course_id);
  select id into v_student_id from public.students
  where course_id = p_course_id and topic_id = p_topic_id
    and auth_user_id = (select auth.uid()) and phone is not null;
  if v_student_id is null then raise exception 'Solo tu equipo puede escribir aquí'; end if;
  if v_body is null or char_length(v_body) not between 1 and 500 then
    raise exception 'Escribe un mensaje de hasta 500 caracteres'; end if;
  if exists (select 1 from public.team_messages where student_id = v_student_id
    and created_at > now() - interval '3 seconds') then
    raise exception 'Espera unos segundos antes de escribir otra vez'; end if;
  insert into public.team_messages(course_id, topic_id, student_id, body)
    values (p_course_id, p_topic_id, v_student_id, v_body);
end;
$function$;

CREATE OR REPLACE FUNCTION private.team_file_access(p_path text, p_write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and
    exists(select 1 from public.students s join public.topics t on t.id=s.topic_id join public.courses c on c.id=s.course_id and c.active
      where s.auth_user_id=(select auth.uid()) and s.phone is not null and not t.archived
      and s.course_id::text=split_part(p_path,'/',1) and s.topic_id::text=split_part(p_path,'/',2))
    and case when p_write then
      split_part(p_path,'/',3)=(select auth.uid())::text
      and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx|zip)$'
    else split_part(p_path,'/',3)=(select auth.uid())::text or
      exists(select 1 from public.team_messages m where m.attachment_path=p_path)
    end;
$function$;

CREATE OR REPLACE FUNCTION private.send_team_file(p_course_id uuid, p_topic_id uuid, p_body text, p_path text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student uuid; v_meta jsonb; v_body text := trim(coalesce(p_body,''));
begin
  perform private.assert_course_active(p_course_id);
  select id into v_student from public.students where course_id=p_course_id and topic_id=p_topic_id
    and auth_user_id=(select auth.uid()) and phone is not null for update;
  if v_student is null or not coalesce(private.team_file_access(p_path,true),false)
    or split_part(p_path,'/',1)<>p_course_id::text or split_part(p_path,'/',2)<>p_topic_id::text then
    raise exception 'Solo tu equipo puede compartir este adjunto'; end if;
  if p_name is null or char_length(p_name) not between 1 and 180 or p_name ~ '[[:cntrl:]]' or char_length(v_body)>500 then
    raise exception 'Revisa el nombre del archivo y el mensaje'; end if;
  if exists(select 1 from public.team_messages where attachment_path=p_path and student_id=v_student) then return; end if;
  select metadata into v_meta from storage.objects where bucket_id='team-attachments' and name=p_path;
  if not found or coalesce((v_meta->>'size')::bigint,0) not between 1 and 10485760 then
    raise exception 'El archivo no terminó de subirse o supera los 10 MB'; end if;
  if exists(select 1 from public.team_messages where student_id=v_student and created_at>now()-interval '3 seconds') then
    raise exception 'Espera unos segundos antes de enviar otro mensaje'; end if;
  insert into public.team_messages(course_id,topic_id,student_id,body,attachment_path,attachment_name,attachment_size,attachment_type)
    values(p_course_id,p_topic_id,v_student,v_body,p_path,p_name,(v_meta->>'size')::bigint,v_meta->>'mimetype');
end;
$function$;
