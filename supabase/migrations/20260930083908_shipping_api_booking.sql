-- Multiple draft shipments must be allowed before a waybill exists.
alter table public.courier_shipment drop constraint courier_tracking_unique;
create unique index courier_tracking_unique on public.courier_shipment(company_id,provider_code,tracking_number) where tracking_number is not null;
create table public.courier_api_settings (
 company_id uuid not null references public.company(id), provider_code text not null check(provider_code in ('courier_guy','shiplogic')),
 secret_id uuid not null references vault.secrets(id), collection_address jsonb not null,
 updated_at timestamptz not null default now(), primary key(company_id,provider_code)
);
create table public.courier_api_attempt (
 shipment_id uuid primary key references public.courier_shipment(id), company_id uuid not null references public.company(id),
 state text not null check(state in ('sending','uncertain','rejected','booked')), response jsonb, updated_at timestamptz not null default now()
);
alter table public.courier_api_settings enable row level security;
alter table public.courier_api_attempt enable row level security;
revoke all on public.courier_api_settings, public.courier_api_attempt from public, anon, authenticated;
grant all on public.courier_api_settings, public.courier_api_attempt to service_role;
create function public.shipping_store_credentials(p_company_id uuid,p_provider text,p_key text,p_address jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_provider not in ('courier_guy','shiplogic') or length(btrim(p_key)) < 8 or length(p_key)>4096 then raise exception 'Invalid courier connection.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||p_provider,0));
 select secret_id into v_id from public.courier_api_settings where company_id=p_company_id and provider_code=p_provider for update;
 if v_id is null then select vault.create_secret(p_key) into v_id; else perform vault.update_secret(v_id,p_key); end if;
 insert into public.courier_api_settings(company_id,provider_code,secret_id,collection_address) values(p_company_id,p_provider,v_id,p_address)
 on conflict(company_id,provider_code) do update set collection_address=excluded.collection_address,updated_at=now();
 insert into public.courier_provider_connection(company_id,provider_code,display_name,connection_mode) values(p_company_id,p_provider,case when p_provider='courier_guy' then 'The Courier Guy' else 'Shiplogic courier account' end,'api')
 on conflict(company_id,provider_code) do update set connection_mode='api',is_active=true,updated_at=now();
end;$$;
create function public.shipping_read_credentials(p_company_id uuid,p_provider text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('key',v.decrypted_secret,'address',s.collection_address,'updated_at',s.updated_at) from public.courier_api_settings s join vault.decrypted_secrets v on v.id=s.secret_id
 join public.courier_provider_connection c on c.company_id=s.company_id and c.provider_code=s.provider_code and c.is_active
 where s.company_id=p_company_id and s.provider_code=p_provider;
$$;
create function public.shipping_reserve_booking(p_company_id uuid,p_shipment_id uuid,p_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare s public.courier_shipment%rowtype;
begin
 select * into s from public.courier_shipment where id=p_shipment_id and company_id=p_company_id for update;
 if s.id is null or s.status<>'draft' or s.updated_at<>p_updated_at then raise exception 'Shipment changed. Refresh and request rates again.'; end if;
 if s.source_type='invoice' and not exists(select 1 from public.invoice where id=s.source_id and company_id=p_company_id and status not in ('draft','cancelled')) then raise exception 'Issue the invoice before booking shipping.'; end if;
 insert into public.courier_api_attempt(shipment_id,company_id,state) values(s.id,p_company_id,'sending')
 on conflict(shipment_id) do update set state='sending',response=null,updated_at=now() where public.courier_api_attempt.state='rejected';
 if not found then raise exception 'A booking is already in progress or needs reconciliation. Check the courier portal before proceeding.'; end if;
end;$$;
create function public.shipping_guard_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='draft' and exists(select 1 from public.courier_api_attempt where shipment_id=old.id and state in ('sending','uncertain','booked')) then raise exception 'Booking in progress or awaiting reconciliation. Draft editing is locked.'; end if;
 return new;
end;$$;
create trigger shipping_guard_draft before update on public.courier_shipment for each row execute function public.shipping_guard_draft();
revoke all on function public.shipping_store_credentials(uuid,text,text,jsonb),public.shipping_read_credentials(uuid,text),public.shipping_reserve_booking(uuid,uuid,timestamptz),public.shipping_guard_draft() from public,anon,authenticated;
grant execute on function public.shipping_store_credentials(uuid,text,text,jsonb),public.shipping_read_credentials(uuid,text),public.shipping_reserve_booking(uuid,uuid,timestamptz) to service_role;
