-- Keep generated group names distinct when an occupied later group remains.
create or replace function private.resize_groups(p_course_id uuid, p_count integer, p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_remove uuid[]; v_position integer; v_label integer := 1; i integer;
begin
  perform 1 from public.courses where id=p_course_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Acceso docente requerido'; end if;
  if p_count is null or p_count not between 1 and 40 or p_capacity is null or p_capacity not between 1 and 100 then
    raise exception 'Elige de 1 a 40 grupos y de 1 a 100 cupos por grupo'; end if;
  select count(*) into v_count from public.topics where course_id=p_course_id and not archived;
  if p_count < v_count then
    select array_agg(id) into v_remove from (
      select t.id from public.topics t where t.course_id=p_course_id and not t.archived
      and not exists(select 1 from public.students s where s.topic_id=t.id)
      order by t.position desc,t.id desc limit (v_count-p_count)) q;
    if coalesce(cardinality(v_remove),0) <> v_count-p_count then
      raise exception 'Hay grupos con integrantes. Libera sus lugares antes de reducir las mesas'; end if;
    update public.topics set archived=true where id=any(v_remove);
  elsif p_count > v_count then
    select coalesce(max(position),0) into v_position from public.topics where course_id=p_course_id;
    for i in 1..(p_count-v_count) loop
      while exists(select 1 from public.topics where course_id=p_course_id and not archived
        and lower(trim(name))=lower('Grupo '||v_label)) loop
        v_label := v_label+1;
      end loop;
      insert into public.topics(course_id,name,capacity,position)
        values(p_course_id,'Grupo '||v_label,p_capacity,v_position+i);
      v_label := v_label+1;
    end loop;
  end if;
end;
$$;
