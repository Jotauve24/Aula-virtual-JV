create table private.student_identities (
 id uuid primary key default gen_random_uuid(),
 document_type text not null check(document_type in ('cedula','passport')),
 country text not null check(country ~ '^[A-Z]{2}$'),
 document_key text not null,
 created_at timestamptz not null default now(),
 unique(document_type,country,document_key)
);
create table private.student_identity_links (
 student_id uuid primary key references public.students(id) on delete cascade,
 identity_id uuid not null references private.student_identities(id),
 course_id uuid not null references public.courses(id) on delete cascade,
 unique(identity_id,course_id)
);
alter table private.student_identities enable row level security;
alter table private.student_identity_links enable row level security;
revoke all on private.student_identities,private.student_identity_links from public,anon,authenticated;

create function private.student_document_key(p_type text,p_number text)
returns text language plpgsql immutable set search_path='' as $$
declare parts text[]; value text;
begin
 if p_number is null or char_length(p_number)>48 then raise exception 'Revisa el número de documento'; end if;
 value:=upper(btrim(translate(p_number,'–—','--')));
 if p_type='cedula' then
  parts:=regexp_match(value,'^([1-9]|1[0-3])((AV|PI))?[[:space:]-]+([0-9]{1,4})[[:space:]-]+([0-9]{1,6})$');
  if parts is not null then return parts[1]||coalesce(parts[2],'')||'-'||(parts[4]::integer)::text||'-'||(parts[5]::integer)::text; end if;
  parts:=regexp_match(value,'^(PE|E|N)[[:space:]-]+([0-9]{1,4})[[:space:]-]+([0-9]{1,6})$');
  if parts is not null then return parts[1]||'-'||(parts[2]::integer)::text||'-'||(parts[3]::integer)::text; end if;
  raise exception 'Revisa la cédula: selecciona el prefijo y escribe tomo y asiento';
 elsif p_type='passport' then
  if value !~ '^[A-Z0-9[:space:]-]{4,32}$' then raise exception 'Revisa el número de pasaporte'; end if;
  value:=regexp_replace(value,'[[:space:]-]','','g');
  if char_length(value) not between 4 and 24 then raise exception 'Revisa el número de pasaporte'; end if;
  return value;
 end if;
 raise exception 'Selecciona cédula o pasaporte';
end $$;
revoke all on function private.student_document_key(text,text) from public,anon,authenticated;

create function private.bind_student_document(p_student_id uuid,p_type text,p_country text,p_number text)
returns void language plpgsql set search_path='' as $$
declare s public.students%rowtype; v_identity uuid; own_identity uuid; v_key text; country_code text;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 select * into s from public.students where id=p_student_id and auth_user_id=(select auth.uid());
 if not found then raise exception 'No perteneces a esta materia'; end if;
 if exists(select 1 from private.student_identity_links where student_id=s.id) then return; end if;
 v_key:=private.student_document_key(p_type,p_number);
 country_code:=case when p_type='cedula' then 'PA' else upper(btrim(p_country)) end;
 if country_code is null or country_code !~ '^[A-Z]{2}$' then raise exception 'Selecciona el país emisor del pasaporte'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('document:'||p_type||':'||country_code||':'||v_key,0));
 select i.id into v_identity from private.student_identities i
 where i.document_type=p_type and i.country=country_code and i.document_key=v_key;
 select distinct l.identity_id into own_identity from private.student_identity_links l
 join public.students owned on owned.id=l.student_id where owned.auth_user_id=(select auth.uid()) limit 1;
 if own_identity is not null and own_identity is distinct from v_identity then
  raise exception 'Tu cuenta ya tiene un documento asociado. Usa el mismo documento en todas tus materias';
 end if;
 if v_identity is not null and exists(select 1 from private.student_identity_links where identity_id=v_identity)
   and not exists(select 1 from private.student_identity_links l join public.students owned on owned.id=l.student_id
     where l.identity_id=v_identity and owned.auth_user_id=(select auth.uid())) then
  raise exception 'Este documento ya tiene una cuenta. Recupera tu cuenta con el correo de tu registro anterior';
 end if;
 if v_identity is null then
  insert into private.student_identities(document_type,country,document_key) values(p_type,country_code,v_key) returning id into v_identity;
 end if;
 if exists(select 1 from private.student_identity_links where identity_id=v_identity and course_id=s.course_id and student_id<>s.id) then
  raise exception 'Este documento ya tiene una inscripción en esta materia. Recupera tu cuenta anterior';
 end if;
 insert into private.student_identity_links(student_id,identity_id,course_id) values(s.id,v_identity,s.course_id);
end $$;
revoke all on function private.bind_student_document(uuid,text,text,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.enroll_student_contact(p_code text, p_email text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
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
  -- Enforced under the course FOR UPDATE lock above: duplicate registrations
  -- cannot race even when two browsers submit simultaneously.
  if exists (select 1 from public.students s
    where s.course_id=v_course.id and lower(btrim(s.email))=v_email) then
    raise exception 'Este correo ya tiene una inscripción en esta materia. Recupera tu cuenta anterior.';
  end if;
  -- The existing course row lock serializes competing registrations.
  if exists (select 1 from public.students s
    where s.course_id=v_course.id and
      private.registration_phone_key(s.phone)=private.registration_phone_key(v_phone)) then
    raise exception 'Este teléfono ya tiene una inscripción en esta materia. Recupera tu cuenta con el correo de tu registro anterior.';
  end if;
  insert into public.students(course_id, email, auth_user_id, original_first_name,
    original_last_name, first_name, last_name, phone, activated_at)
    values (v_course.id, v_email, (select auth.uid()), trim(p_first_name),
      trim(p_last_name), trim(p_first_name), trim(p_last_name), v_phone, now());
  return jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name);
end;
$function$;
revoke all on function private.enroll_student_contact(text,text,text,text,text) from public,anon,authenticated;

create function public.enroll_student_document(p_code text,p_email text default null,p_first_name text default null,
 p_last_name text default null,p_phone text default null,p_document_type text default null,
 p_document_number text default null,p_document_country text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_student_id uuid; v_existing boolean;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student:'||(select auth.uid())::text,0));
 -- A full registration needs a document. Resume calls have no contact details.
 if p_email is not null and (p_document_type is null or p_document_number is null) then
  raise exception 'Completa tu cédula o pasaporte para registrarte';
 end if;
 result:=private.enroll_student_contact(p_code,p_email,p_first_name,p_last_name,p_phone);
 select s.id into v_student_id from public.students s where s.course_id=(result->>'course_id')::uuid and s.auth_user_id=(select auth.uid());
 if p_document_type is not null or p_document_number is not null then
  perform private.bind_student_document(v_student_id,p_document_type,p_document_country,p_document_number);
 end if;
 return result;
end $$;
revoke all on function public.enroll_student_document(text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.enroll_student_document(text,text,text,text,text,text,text,text) to authenticated;

-- Cached clients may reopen existing profiles but cannot create new ones.
create or replace function public.enroll_student(p_code text,p_email text default null,p_first_name text default null,p_last_name text default null,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_course_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 select c.id into v_course_id from public.courses c join public.students s on s.course_id=c.id
 where s.auth_user_id=(select auth.uid()) and c.active and c.code_hash=
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(upper(regexp_replace(p_code,'[[:space:]]','','g')),'UTF8')),'hex');
 if v_course_id is not null then return private.enroll_student_contact(p_code); end if;
 raise exception 'Completa tu cédula o pasaporte para registrarte. Actualiza la página';
end $$;
revoke all on function public.enroll_student(text,text,text,text,text) from public,anon;
grant execute on function public.enroll_student(text,text,text,text,text) to authenticated;

create function public.student_document_status(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students%rowtype; v_identity uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student:'||(select auth.uid())::text,0));
 perform private.assert_course_active(p_course_id);
 select * into s from public.students where course_id=p_course_id and auth_user_id=(select auth.uid());
 if not found then raise exception 'No perteneces a esta materia'; end if;
 if exists(select 1 from private.student_identity_links where student_id=s.id) then return jsonb_build_object('required',false); end if;
 select distinct l.identity_id into v_identity from private.student_identity_links l join public.students owned on owned.id=l.student_id
 where owned.auth_user_id=(select auth.uid()) limit 1;
 if v_identity is not null and not exists(select 1 from private.student_identity_links where identity_id=v_identity and course_id=p_course_id) then
  insert into private.student_identity_links(student_id,identity_id,course_id) values(s.id,v_identity,p_course_id);
  return jsonb_build_object('required',false);
 end if;
 return jsonb_build_object('required',true);
end $$;
revoke all on function public.student_document_status(uuid) from public,anon;
grant execute on function public.student_document_status(uuid) to authenticated;

create function public.student_set_document(p_course_id uuid,p_document_type text,p_document_number text,p_document_country text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_student_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student:'||(select auth.uid())::text,0));
 perform private.assert_course_active(p_course_id);
 select s.id into v_student_id from public.students s where s.course_id=p_course_id and s.auth_user_id=(select auth.uid());
 if v_student_id is null then raise exception 'No perteneces a esta materia'; end if;
 perform private.bind_student_document(v_student_id,p_document_type,p_document_country,p_document_number);
end $$;
revoke all on function public.student_set_document(uuid,text,text,text) from public,anon;
grant execute on function public.student_set_document(uuid,text,text,text) to authenticated;

-- Recovery still requires a verified email, never a document number alone.
-- Locate the original subject when a duplicate document was detected in a
-- different subject, so the student need not know the old classroom code.
create function public.student_recover_document_account()
returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users%rowtype; candidate record; result jsonb; recovered_count integer:=0;
begin
 select * into u from auth.users where id=(select auth.uid());
 if not found or coalesce(u.is_anonymous,true) or u.email_confirmed_at is null then
  raise exception 'Verifica primero tu correo electrónico';
 end if;
 if exists(select 1 from public.teachers where user_id=u.id) then raise exception 'Utiliza una cuenta estudiantil';end if;
 for candidate in
  select distinct s.course_id from public.students s
  join private.student_identity_links l on l.student_id=s.id
  join public.courses c on c.id=s.course_id and c.active
  where lower(btrim(s.email))=lower(btrim(u.email))
  order by s.course_id limit 50
 loop
  result:=private.student_try_verified_email_recovery(candidate.course_id);
  if result->>'status' in ('active','recovered') then recovered_count:=recovered_count+1;end if;
 end loop;
 return jsonb_build_object('recovered',recovered_count);
end $$;
revoke all on function public.student_recover_document_account() from public,anon;
grant execute on function public.student_recover_document_account() to authenticated;
