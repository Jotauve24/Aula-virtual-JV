-- pg_net was introduced by the preceding feature migration. Move its
-- extension registration out of the public API schema before enabling clients.
-- Refuse to recreate it if an HTTP request is waiting; never discard queued work.
do $$ begin
 if exists(select 1 from net.http_request_queue) then
   raise exception 'Wait until notification requests finish before this migration';
 end if;
end $$;
drop extension pg_net;
create extension pg_net with schema extensions;
revoke usage on schema net from public,anon,authenticated;
