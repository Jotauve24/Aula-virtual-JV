-- Private Web Push subscriptions. No existing registration or chat RPC changes.
create extension if not exists pg_net;

create table private.chat_push_subscriptions (
 endpoint_hash text primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(char_length(endpoint) between 20 and 4096),
 p256dh text not null,
 auth_key text not null,
 updated_at timestamptz not null default now()
);
create index chat_push_subscriptions_user on private.chat_push_subscriptions(auth_user_id,updated_at desc);
alter table private.chat_push_subscriptions enable row level security;
revoke all on private.chat_push_subscriptions from public,anon,authenticated;

create table private.chat_push_deliveries (
 message_id bigint primary key references public.team_messages(id) on delete cascade,
 claimed_at timestamptz not null default now(),
 sent integer not null default 0,
 failed integer not null default 0
);
alter table private.chat_push_deliveries enable row level security;
revoke all on private.chat_push_deliveries from public,anon,authenticated;

-- The deployment initializes these Vault secrets separately, never in Git.
-- aula_chat_push_vapid: {publicKey,privateKey}; aula_chat_push_hook: random token.
create function public.student_push_config()
returns jsonb language plpgsql security definer set search_path='' as $$
declare keys jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 if not exists(select 1 from public.students s join public.courses c on c.id=s.course_id
   where s.auth_user_id=(select auth.uid()) and c.active and s.phone is not null) then
   raise exception 'Inscripción requerida';
 end if;
 select decrypted_secret::jsonb into keys from vault.decrypted_secrets where name='aula_chat_push_vapid' limit 1;
 return jsonb_build_object('enabled',keys is not null,'publicKey',keys->>'publicKey');
end $$;

create function public.student_push_subscribe(p_subscription jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare target text:=p_subscription->>'endpoint'; fingerprint text; user_id uuid:=(select auth.uid());
 dh text:=p_subscription#>>'{keys,p256dh}'; secret text:=p_subscription#>>'{keys,auth}';
begin
 if user_id is null then raise exception 'Sesión requerida'; end if;
 if not exists(select 1 from public.students s join public.courses c on c.id=s.course_id
   where s.auth_user_id=user_id and c.active and s.phone is not null) then raise exception 'Inscripción requerida'; end if;
 if target is null or char_length(target)>4096 or target !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-zA-Z0-9-]+\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com)(:443)?/'
   or dh is null or dh !~ '^[A-Za-z0-9_-]{87}={0,2}$' or secret is null or secret !~ '^[A-Za-z0-9_-]{22}={0,2}$' then
   raise exception 'Suscripción no válida';
 end if;
 fingerprint:=encode(extensions.digest(target,'sha256'),'hex');
 insert into private.chat_push_subscriptions(endpoint_hash,auth_user_id,endpoint,p256dh,auth_key)
 values(fingerprint,user_id,target,dh,secret)
 on conflict(endpoint_hash) do update set auth_user_id=excluded.auth_user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,updated_at=now();
 -- At most ten current devices per account; remove stale subscriptions too.
 delete from private.chat_push_subscriptions where auth_user_id=user_id and endpoint_hash in
  (select endpoint_hash from private.chat_push_subscriptions where auth_user_id=user_id order by updated_at desc,endpoint_hash offset 10);
 delete from private.chat_push_subscriptions where auth_user_id=user_id and updated_at<now()-interval '90 days';
end $$;

create function public.student_push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sesión requerida'; end if;
 delete from private.chat_push_subscriptions where auth_user_id=(select auth.uid())
   and endpoint_hash=encode(extensions.digest(p_endpoint,'sha256'),'hex');
end $$;
revoke all on function public.student_push_config(),public.student_push_subscribe(jsonb),public.student_push_unsubscribe(text) from public,anon;
grant execute on function public.student_push_config(),public.student_push_subscribe(jsonb),public.student_push_unsubscribe(text) to authenticated;

create function private.enqueue_chat_push()
returns trigger language plpgsql security definer set search_path='' as $$
declare hook text;
begin
 -- No network work when the team has no subscribed recipients.
 if not exists(select 1 from public.students s join private.chat_push_subscriptions p on p.auth_user_id=s.auth_user_id
   where s.course_id=new.course_id and s.topic_id=new.topic_id and s.id<>new.student_id
   and s.auth_user_id<>(select auth_user_id from public.students where id=new.student_id)
   and p.updated_at>now()-interval '90 days') then return new; end if;
 select decrypted_secret into hook from vault.decrypted_secrets where name='aula_chat_push_hook' limit 1;
 if hook is null then return new; end if;
 perform net.http_post(url:='https://zzxaarehltihndazabfj.supabase.co/functions/v1/chat-push',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('message_id',new.id::text,'token',hook),timeout_milliseconds:=5000);
 return new;
exception when others then
 -- An unavailable notification provider must never stop a valid chat message.
 return new;
end $$;
revoke all on function private.enqueue_chat_push() from public,anon,authenticated;
create trigger team_message_push after insert on public.team_messages for each row execute function private.enqueue_chat_push();

create function public.chat_push_claim(p_message_id bigint,p_hook_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare hook text; keys jsonb; message public.team_messages%rowtype; claimed bigint; recipients jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso denegado'; end if;
 select decrypted_secret into hook from vault.decrypted_secrets where name='aula_chat_push_hook' limit 1;
 if hook is null or p_hook_token is distinct from hook then raise exception 'Acceso denegado'; end if;
 select m.* into message from public.team_messages m join public.courses c on c.id=m.course_id
   where m.id=p_message_id and c.active and m.created_at>now()-interval '15 minutes';
 if not found then return null; end if;
 insert into private.chat_push_deliveries(message_id) values(message.id) on conflict do nothing returning message_id into claimed;
 if claimed is null then return null; end if;
 select decrypted_secret::jsonb into keys from vault.decrypted_secrets where name='aula_chat_push_vapid' limit 1;
 if keys is null then return null; end if;
 -- Resolve membership now, not from untrusted client or webhook recipient IDs.
 select coalesce(jsonb_agg(jsonb_build_object('endpoint',p.endpoint,'keys',jsonb_build_object('p256dh',p.p256dh,'auth',p.auth_key))),'[]'::jsonb)
 into recipients from private.chat_push_subscriptions p where p.updated_at>now()-interval '90 days' and exists
 (select 1 from public.students s where s.auth_user_id=p.auth_user_id and s.course_id=message.course_id
  and s.topic_id=message.topic_id and s.phone is not null and s.id<>message.student_id)
 and p.auth_user_id<>(select auth_user_id from public.students where id=message.student_id);
 return jsonb_build_object('courseId',message.course_id,'topicId',message.topic_id,'vapid',keys,'subscriptions',recipients);
end $$;

create function public.chat_push_finish(p_message_id bigint,p_expired_endpoints text[],p_sent integer,p_failed integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso denegado'; end if;
 delete from private.chat_push_subscriptions where endpoint=any(coalesce(p_expired_endpoints,'{}'::text[]));
 update private.chat_push_deliveries set sent=greatest(0,p_sent),failed=greatest(0,p_failed) where message_id=p_message_id;
 delete from private.chat_push_deliveries where claimed_at<now()-interval '7 days';
end $$;
revoke all on function public.chat_push_claim(bigint,text),public.chat_push_finish(bigint,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.chat_push_claim(bigint,text),public.chat_push_finish(bigint,text[],integer,integer) to service_role;
