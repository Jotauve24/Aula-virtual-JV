-- Synthetic documentation addresses only. Every effect is rolled back.
begin;
do $$
declare baseline bigint; fingerprints bigint; value jsonb;
begin
  select unique_visits into baseline from public.site_visit_totals where id=1;
  select count(*) into fingerprints from private.site_visitors;
  value:=public.register_site_visit('192.0.2.18');
  if (value->>'total')::bigint<>baseline+1 then raise exception 'New IP not counted'; end if;
  value:=public.register_site_visit('192.0.2.18');
  if (value->>'total')::bigint<>baseline+1 then raise exception 'Repeated IP counted twice'; end if;
  value:=public.register_site_visit('::ffff:192.0.2.18');
  if (value->>'total')::bigint<>baseline+1 then raise exception 'IPv4-mapped address duplicated'; end if;
  perform public.register_site_visit('2001:db8:0:0:0:0:0:18');
  value:=public.register_site_visit('2001:db8::18');
  if (value->>'total')::bigint<>baseline+2 then raise exception 'IPv6 spelling duplicated'; end if;
  if (select count(*) from private.site_visitors)<>fingerprints+2 then raise exception 'Incorrect fingerprint count'; end if;
  if exists(select 1 from private.site_visitors where octet_length(fingerprint)<>32) then raise exception 'Invalid fingerprint'; end if;
  begin perform public.register_site_visit(null);raise exception 'Null IP accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.register_site_visit('192.0.2.0/24');raise exception 'Network accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.register_site_visit('not-an-ip');raise exception 'Invalid IP accepted'; exception when invalid_text_representation then null; end;
  if has_function_privilege('anon','public.register_site_visit(text)','execute') or
     has_function_privilege('authenticated','public.register_site_visit(text)','execute') then raise exception 'Client can write visits'; end if;
  if not has_function_privilege('service_role','public.register_site_visit(text)','execute') then raise exception 'Server cannot register'; end if;
  if has_table_privilege('anon','private.site_visitors','select') or
     has_table_privilege('authenticated','private.site_visit_settings','select') then raise exception 'Private data exposed'; end if;
  if has_table_privilege('anon','public.site_visit_totals','update') or
     has_table_privilege('authenticated','public.site_visit_totals','insert') then raise exception 'Counter is writable'; end if;
  if (select prosecdef from pg_proc where oid='public.register_site_visit(text)'::regprocedure) then raise exception 'Public wrapper is a definer'; end if;
end $$;
set local role anon;
do $$ begin
  if (select count(*) from public.site_visit_totals)<>1 then raise exception 'Aggregate inaccessible'; end if;
  begin perform public.register_site_visit('192.0.2.19');raise exception 'Anon wrote a visit'; exception when insufficient_privilege then null; end;
  begin perform fingerprint from private.site_visitors;raise exception 'Anon read fingerprints'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.register_site_visit('192.0.2.20')->>'total' as synthetic_total;
reset role;
rollback;
