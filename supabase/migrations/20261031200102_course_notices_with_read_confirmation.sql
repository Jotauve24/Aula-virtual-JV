-- Teacher notices are immutable after publication. A correction is a new notice,
-- so an earlier confirmation never certifies text the student has not seen.
create table private.course_notices (
  id uuid primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid,
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  foreign key (topic_id,course_id) references public.topics(id,course_id) on delete cascade
);
create table private.course_notice_reads (
  notice_id uuid not null references private.course_notices(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (notice_id,student_id)
);
create index course_notices_course_created on private.course_notices(course_id,created_at desc,id);
create index course_notices_topic on private.course_notices(topic_id,course_id) where topic_id is not null;
create index course_notice_reads_student on private.course_notice_reads(student_id);
alter table private.course_notices enable row level security;
alter table private.course_notice_reads enable row level security;
revoke all on private.course_notices,private.course_notice_reads from public,anon,authenticated;

create function private.teacher_course_notices(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.courses
    where id=p_course_id and teacher_id=(select auth.uid())) then
    raise exception 'Acceso docente requerido' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'title',n.title,'body',n.body,'topicId',n.topic_id,
    'topicName',t.name,'createdAt',n.created_at,'retiredAt',n.retired_at,
    'recipientCount',a.total,'confirmedCount',a.confirmed,'pendingCount',a.total-a.confirmed
  ) order by (n.retired_at is null) desc,n.created_at desc,n.id),'[]'::jsonb)
  from (select * from private.course_notices where course_id=p_course_id
    order by (retired_at is null) desc,created_at desc,id limit 30) n
  left join public.topics t on t.id=n.topic_id and t.course_id=n.course_id
  cross join lateral (select count(*) as total,count(r.confirmed_at) as confirmed
    from public.students s left join private.course_notice_reads r
      on r.notice_id=n.id and r.student_id=s.id
    where s.course_id=p_course_id and (n.topic_id is null or s.topic_id=n.topic_id)) a);
end;
$$;

create function private.teacher_publish_course_notice(
  p_course_id uuid,p_notice_id uuid,p_title text,p_body text,p_topic_id uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare c public.courses%rowtype; n private.course_notices%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  -- Same lock order as enrollment, team transfers, retirement and confirmation.
  select * into c from public.courses where id=p_course_id
    and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  if not c.active then raise exception 'Restaura la materia antes de publicar un aviso'; end if;
  if p_notice_id is null or p_title is null or p_body is null
    or char_length(btrim(p_title)) not between 2 and 120
    or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Escribe un título de 2 a 120 caracteres y un mensaje de hasta 4000' using errcode='22023';
  end if;
  if p_topic_id is not null and not exists(select 1 from public.topics
    where id=p_topic_id and course_id=p_course_id and not archived) then
    raise exception 'Equipo no disponible en esta materia' using errcode='22023';
  end if;
  select * into n from private.course_notices where id=p_notice_id;
  if found then
    if n.course_id=p_course_id and n.topic_id is not distinct from p_topic_id
      and n.title=btrim(p_title) and n.body=btrim(p_body) then return n.id; end if;
    raise exception 'Este envío ya se utilizó. Abre un aviso nuevo.' using errcode='22023';
  end if;
  if (select count(*) from private.course_notices where course_id=p_course_id and retired_at is null)>=10 then
    raise exception 'Ya hay 10 avisos activos. Retira uno antes de publicar otro.' using errcode='22023';
  end if;
  insert into private.course_notices(id,course_id,topic_id,title,body)
    values(p_notice_id,p_course_id,p_topic_id,btrim(p_title),btrim(p_body));
  return p_notice_id;
end;
$$;

create function private.teacher_retire_course_notice(p_course_id uuid,p_notice_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido' using errcode='42501'; end if;
  update private.course_notices set retired_at=coalesce(retired_at,now())
    where id=p_notice_id and course_id=p_course_id;
  if not found then raise exception 'Aviso no disponible en esta materia' using errcode='22023'; end if;
end;
$$;

create function private.teacher_course_notice_readers(p_course_id uuid,p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare n private.course_notices%rowtype;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.courses
    where id=p_course_id and teacher_id=(select auth.uid())) then
    raise exception 'Acceso docente requerido' using errcode='42501';
  end if;
  select * into n from private.course_notices where id=p_notice_id and course_id=p_course_id;
  if not found then raise exception 'Aviso no disponible en esta materia' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,
    'name',s.first_name||' '||s.last_name,'confirmedAt',r.confirmed_at)
    order by s.last_name,s.first_name,s.id),'[]'::jsonb)
    from public.students s left join private.course_notice_reads r on r.notice_id=n.id and r.student_id=s.id
    where s.course_id=p_course_id and (n.topic_id is null or s.topic_id=n.topic_id));
end;
$$;

create function private.student_course_notices(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.students%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sesión de estudiante requerida' using errcode='42501'; end if;
  perform private.assert_course_active(p_course_id);
  select * into s from public.students where course_id=p_course_id and auth_user_id=(select auth.uid()) and phone is not null;
  if not found then raise exception 'No perteneces a esta materia' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,
    'createdAt',n.created_at,'confirmedAt',r.confirmed_at) order by n.created_at,n.id),'[]'::jsonb)
    from private.course_notices n left join private.course_notice_reads r on r.notice_id=n.id and r.student_id=s.id
    where n.course_id=p_course_id and n.retired_at is null and (n.topic_id is null or n.topic_id=s.topic_id));
end;
$$;

create function private.student_confirm_course_notice(p_course_id uuid,p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.students%rowtype; n private.course_notices%rowtype; confirmed timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Sesión de estudiante requerida' using errcode='42501'; end if;
  perform 1 from public.courses where id=p_course_id and active for share;
  if not found then raise exception 'Materia deshabilitada'; end if;
  select * into s from public.students where course_id=p_course_id and auth_user_id=(select auth.uid()) and phone is not null;
  if not found then raise exception 'No perteneces a esta materia' using errcode='42501'; end if;
  select * into n from private.course_notices where id=p_notice_id and course_id=p_course_id
    and (topic_id is null or topic_id=s.topic_id);
  if not found then raise exception 'Aviso no disponible para tu perfil' using errcode='42501'; end if;
  if n.retired_at is not null then return jsonb_build_object('retired',true); end if;
  insert into private.course_notice_reads(notice_id,student_id) values(n.id,s.id)
    on conflict (notice_id,student_id) do nothing;
  select confirmed_at into confirmed from private.course_notice_reads where notice_id=n.id and student_id=s.id;
  return jsonb_build_object('confirmedAt',confirmed,'retired',false);
end;
$$;

create function public.teacher_course_notices(p_course_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.teacher_course_notices(p_course_id); $$;
create function public.teacher_publish_course_notice(p_course_id uuid,p_notice_id uuid,p_title text,p_body text,p_topic_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select private.teacher_publish_course_notice(p_course_id,p_notice_id,p_title,p_body,p_topic_id); $$;
create function public.teacher_retire_course_notice(p_course_id uuid,p_notice_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.teacher_retire_course_notice(p_course_id,p_notice_id); $$;
create function public.teacher_course_notice_readers(p_course_id uuid,p_notice_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.teacher_course_notice_readers(p_course_id,p_notice_id); $$;
create function public.student_course_notices(p_course_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.student_course_notices(p_course_id); $$;
create function public.student_confirm_course_notice(p_course_id uuid,p_notice_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.student_confirm_course_notice(p_course_id,p_notice_id); $$;

-- Explicit function grants only. No client receives table access, even in private.
revoke all on function private.teacher_course_notices(uuid), public.teacher_course_notices(uuid),
  private.teacher_publish_course_notice(uuid,uuid,text,text,uuid), public.teacher_publish_course_notice(uuid,uuid,text,text,uuid),
  private.teacher_retire_course_notice(uuid,uuid), public.teacher_retire_course_notice(uuid,uuid),
  private.teacher_course_notice_readers(uuid,uuid), public.teacher_course_notice_readers(uuid,uuid),
  private.student_course_notices(uuid), public.student_course_notices(uuid),
  private.student_confirm_course_notice(uuid,uuid), public.student_confirm_course_notice(uuid,uuid) from public,anon;
grant execute on function private.teacher_course_notices(uuid), public.teacher_course_notices(uuid),
  private.teacher_publish_course_notice(uuid,uuid,text,text,uuid), public.teacher_publish_course_notice(uuid,uuid,text,text,uuid),
  private.teacher_retire_course_notice(uuid,uuid), public.teacher_retire_course_notice(uuid,uuid),
  private.teacher_course_notice_readers(uuid,uuid), public.teacher_course_notice_readers(uuid,uuid),
  private.student_course_notices(uuid), public.student_course_notices(uuid),
  private.student_confirm_course_notice(uuid,uuid), public.student_confirm_course_notice(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
