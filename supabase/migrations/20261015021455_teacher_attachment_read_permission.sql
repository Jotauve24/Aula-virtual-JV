-- Only the owner of the originating, active course may download existing
-- team attachments. No new insert, update or delete permissions are granted.
create function private.teacher_attachment_access(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and
    exists(
      select 1 from public.team_messages m
      join public.courses c on c.id=m.course_id
      join public.teachers t on t.user_id=c.teacher_id
      where m.attachment_path=p_path
        and m.course_id::text=split_part(p_path,'/',1)
        and m.topic_id::text=split_part(p_path,'/',2)
        and c.teacher_id=(select auth.uid()) and c.active
    );
$$;
revoke all on function private.teacher_attachment_access(text) from public,anon;
grant execute on function private.teacher_attachment_access(text) to authenticated;
create policy teacher_attachment_read on storage.objects for select to authenticated
using (bucket_id='team-attachments' and private.teacher_attachment_access(name));
