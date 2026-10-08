-- Aula Encuentro: la identidad proviene de Supabase Auth. Ningún código de
-- materia ni nombre de la lista es una credencial personal.
create table public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(user_id),
  name text not null check (char_length(name) between 2 and 120),
  code_hash text not null unique,
  registration_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  capacity integer not null check (capacity between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, course_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  -- El docente puede importar solo nombres. El correo se vincula en una
  -- invitación individual o al aprobar una solicitud de ingreso.
  email text,
  auth_user_id uuid references auth.users(id) on delete set null,
  original_first_name text not null,
  original_last_name text not null,
  first_name text not null,
  last_name text not null,
  national_id text,
  phone text check (phone is null or phone ~ '^[0-9]{4}-[0-9]{4}$'),
  avatar jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  topic_id uuid,
  created_at timestamptz not null default now(),
  unique (course_id, auth_user_id),
  unique (course_id, email),
  foreign key (topic_id, course_id) references public.topics(id, course_id)
);

create table public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_student_id uuid references public.students(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create index students_course_topic on public.students(course_id, topic_id);
create index topics_course on public.topics(course_id);
create index claims_course_status on public.claim_requests(course_id, status);

alter table public.teachers enable row level security;
alter table public.courses enable row level security;
alter table public.topics enable row level security;
alter table public.students enable row level security;
alter table public.claim_requests enable row level security;

-- Las operaciones se encapsulan en RPC: la tabla students contiene datos
-- privados que jamás deben salir en una lectura general del salón.
revoke all on public.teachers, public.courses, public.topics,
  public.students, public.claim_requests from anon, authenticated;

create function public.my_courses()
returns table (id uuid, name text, registration_open boolean,
               student_count bigint, topic_count bigint)
language sql security definer set search_path = '' as $$
  select c.id, c.name, c.registration_open,
    (select count(*) from public.students s where s.course_id = c.id),
    (select count(*) from public.topics t where t.course_id = c.id)
  from public.courses c where c.teacher_id = (select auth.uid())
  order by c.created_at desc;
$$;

create function public.create_course(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.teachers where user_id = (select auth.uid())) then
    raise exception 'Acceso docente requerido';
  end if;
  if char_length(trim(p_name)) not between 2 and 120 or
     p_code !~ '^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$' then
    raise exception 'Nombre o código inválido';
  end if;
  insert into public.courses(teacher_id, name, code_hash)
    values ((select auth.uid()), trim(p_name),
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(upper(trim(p_code)), 'UTF8')), 'hex'))
    returning id into v_id;
  return v_id;
end;
$$;

create function public.request_course(p_code text, p_student_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course public.courses%rowtype; v_email text; v_student public.students%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión primero'; end if;
  if p_code is null or char_length(p_code) > 48 then raise exception 'Código inválido'; end if;
  select * into v_course from public.courses
    where code_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      upper(regexp_replace(p_code, '[[:space:]]', '', 'g')), 'UTF8')), 'hex');
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
$$;

create function public.my_profile(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student public.students%rowtype; v_course public.courses%rowtype;
begin
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
$$;

create function public.save_my_profile(p_course_id uuid, p_first_name text,
  p_last_name text, p_national_id text, p_phone text, p_avatar jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
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
$$;

create function public.course_room(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.students where course_id = p_course_id
      and auth_user_id = (select auth.uid()) and national_id is not null
      and phone is not null) and
     not exists (select 1 from public.courses where id = p_course_id
      and teacher_id = (select auth.uid())) then
    raise exception 'No perteneces a esta materia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
    'instructions', t.instructions, 'capacity', t.capacity,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name',
      s.first_name || ' ' || s.last_name, 'avatar', s.avatar)), '[]'::jsonb)
      from public.students s where s.topic_id = t.id))), '[]'::jsonb)
    into v_result from public.topics t where t.course_id = p_course_id;
  return v_result;
end;
$$;

create function public.choose_topic(p_course_id uuid, p_topic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_topic public.topics%rowtype;
begin
  -- Bloqueo por materia serializa incluso dos estudiantes que toman el último cupo.
  perform 1 from public.courses where id = p_course_id and registration_open for update;
  if not found then raise exception 'La elección está cerrada'; end if;
  select * into v_topic from public.topics where id = p_topic_id and course_id = p_course_id;
  if not found then raise exception 'Tema no encontrado'; end if;
  if (select count(*) from public.students where topic_id = p_topic_id) >= v_topic.capacity then
    raise exception 'El equipo está completo';
  end if;
  update public.students set topic_id = p_topic_id where course_id = p_course_id
    and auth_user_id = (select auth.uid()) and topic_id is null
    and national_id is not null and phone is not null;
  if not found then raise exception 'Confirma tus datos o revisa tu equipo actual'; end if;
end;
$$;

revoke all on function public.my_courses(), public.create_course(text,text),
  public.request_course(text,uuid), public.my_profile(uuid),
  public.save_my_profile(uuid,text,text,text,text,jsonb),
  public.course_room(uuid), public.choose_topic(uuid,uuid) from public, anon;
grant execute on function public.my_courses(), public.create_course(text,text),
  public.request_course(text,uuid), public.my_profile(uuid),
  public.save_my_profile(uuid,text,text,text,text,jsonb),
  public.course_room(uuid), public.choose_topic(uuid,uuid) to authenticated;
