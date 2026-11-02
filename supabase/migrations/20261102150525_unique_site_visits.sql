-- The browser can read only the single aggregate row. Raw IPs are never stored.
create table private.site_visit_settings (
  singleton boolean primary key default true check (singleton),
  pepper bytea not null check (octet_length(pepper)=32)
);
insert into private.site_visit_settings(pepper) values(extensions.gen_random_bytes(32));

create table private.site_visitors (
  fingerprint bytea primary key check (octet_length(fingerprint)=32)
);
create table public.site_visit_totals (
  id smallint primary key default 1 check (id=1),
  unique_visits bigint not null default 0 check (unique_visits>=0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.site_visit_totals(id) values(1);

alter table private.site_visit_settings enable row level security;
alter table private.site_visitors enable row level security;
alter table public.site_visit_totals enable row level security;
revoke all on private.site_visit_settings,private.site_visitors,public.site_visit_totals from public,anon,authenticated,service_role;
-- Private data is reachable only through the tightly scoped server RPC below.
create policy site_visit_settings_server on private.site_visit_settings to service_role using(true) with check(true);
create policy site_visitors_server on private.site_visitors to service_role using(true) with check(true);
create policy site_visit_totals_public_read on public.site_visit_totals for select to anon,authenticated,service_role using(id=1);
grant select on public.site_visit_totals to anon,authenticated,service_role;

create function private.register_site_visit(p_ip text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare address inet; secret bytea; digest bytea;
begin
  if p_ip is null or length(p_ip)>64 then raise exception 'Invalid address' using errcode='22023'; end if;
  address:=p_ip::inet;
  if masklen(address)<>(case family(address) when 4 then 32 else 128 end) then
    raise exception 'A single address is required' using errcode='22023';
  end if;
  -- IPv4-mapped IPv6 and its IPv4 representation identify the same address.
  if family(address)=6 and address <<='::ffff:0.0.0.0/96'::inet then
    address:='0.0.0.0'::inet+(address-'::ffff:0.0.0.0'::inet);
  end if;
  select pepper into strict secret from private.site_visit_settings where singleton;
  digest:=extensions.hmac(convert_to(host(address),'UTF8'),secret,'sha256');
  insert into private.site_visitors(fingerprint) values(digest) on conflict do nothing;
  if found then
    -- One atomic increment per newly inserted address, including concurrent calls.
    update public.site_visit_totals set unique_visits=unique_visits+1,updated_at=clock_timestamp() where id=1;
  end if;
  return (select jsonb_build_object('total',unique_visits,'startedAt',started_at,'updatedAt',updated_at)
    from public.site_visit_totals where id=1);
end;
$$;
create function public.register_site_visit(p_ip text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.register_site_visit(p_ip); $$;
revoke all on function private.register_site_visit(text),public.register_site_visit(text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.register_site_visit(text),public.register_site_visit(text) to service_role;

-- Only the aggregate is published; fingerprints and the pepper remain private.
alter publication supabase_realtime add table public.site_visit_totals;
notify pgrst,'reload schema';
