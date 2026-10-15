-- ZombieAdmin is a local classroom demonstration and no longer needs
-- to inspect actual student messages or files. Revoke the previous grants.
drop policy if exists teacher_attachment_read on storage.objects;
drop function if exists private.teacher_attachment_access(text);
drop function if exists public.teacher_team_chat_read(uuid,uuid);
