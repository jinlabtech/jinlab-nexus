-- Second-hand trading: additive private register and explicitly granted RPCs.
-- No owner is inferred from the legacy mutable user_profile/RBAC tables.
-- Enrol the independently verified owner with a separate administrator statement.
create schema if not exists nexus_sh;
revoke all on schema nexus_sh from public, anon, authenticated;
grant usage on schema nexus_sh to authenticated;

create table nexus_sh.access (
  user_id uuid not null references auth.users(id),
  branch_id uuid not null references public.branch(id),
  company_id uuid not null references public.company(id),
  branch_name text not null,
  role text not null check (role in ('owner','clerk','auditor')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, branch_id)
);
create index sh_access_branch_idx on nexus_sh.access(branch_id) where revoked_at is null;
create table nexus_sh.policy (
  branch_id uuid primary key references public.branch(id),
  company_id uuid not null references public.company(id),
  hold_days integer not null default 8 check (hold_days between 7 and 365),
  legal_review_reference text,
  registration_reference text,
  premises_confirmed boolean not null default false,
  goods_scope_confirmed boolean not null default false,
  reviewed_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table nexus_sh.party (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id),
  branch_id uuid not null references public.branch(id),
  kind text not null check (kind in ('seller','buyer')),
  full_name text not null check (length(full_name) between 2 and 200),
  id_type text not null check (id_type in ('sa_id','passport','other')),
  id_number text not null check (length(id_number) between 4 and 40),
  date_of_birth date not null,
  address text not null check (length(address) between 5 and 1000),
  phone text not null check (length(phone) between 5 and 40),
  original_id_sighted boolean not null check (original_id_sighted),
  id_copy_reference text not null check (length(id_copy_reference) between 3 and 300),
  verification_reference text not null check (length(verification_reference) between 3 and 500),
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  unique (id,branch_id)
);
create index sh_party_branch_idx on nexus_sh.party(branch_id,verified_at desc);
create sequence nexus_sh.register_number;
create table nexus_sh.item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id),
  branch_id uuid not null references public.branch(id),
  register_number text not null unique default ('SH-' || lpad(nextval('nexus_sh.register_number')::text,8,'0')),
  seller_id uuid not null,
  foreign key (seller_id,branch_id) references nexus_sh.party(id,branch_id),
  description text not null check (length(description) between 3 and 1000),
  brand text not null check (length(brand) between 1 and 100),
  model text not null check (length(model) between 1 and 150),
  serial_number text check (length(serial_number) between 2 and 100),
  imei text check (imei ~ '^[0-9]{15}$'),
  communications_device boolean not null default false,
  condition text not null check (length(condition) between 3 and 1000),
  purchase_amount numeric(12,2) not null check (purchase_amount between 0 and 9999999999),
  valuation_amount numeric(12,2) not null check (valuation_amount between 0 and 9999999999),
  acquired_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  acquisition_reference text not null,
  acquisition_type text not null check (acquisition_type in ('purchase','trade_in')),
  trade_in_reference text,
  ownership_reference text not null,
  ownership_declared boolean not null check (ownership_declared),
  screening_result text not null check (screening_result in ('clear','flagged','unknown')),
  screening_source text not null,
  screening_reference text not null,
  screening_at timestamptz not null default now(),
  acquired_by uuid not null references auth.users(id),
  staff_attestation text not null,
  hold_days integer not null check (hold_days >= 7),
  hold_until timestamptz not null,
  policy_snapshot jsonb not null,
  status text not null check (status in ('held','approved','released','quarantined','sold')),
  flag_reason text,
  saps_reference text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  released_by uuid references auth.users(id),
  released_at timestamptz,
  inventory_item_id uuid unique references public.inventory_item(id),
  service_job_id uuid references public.service_job(id),
  buyer_id uuid,
  foreign key (buyer_id,branch_id) references nexus_sh.party(id,branch_id),
  sale_amount numeric(12,2) check (sale_amount between 0 and 9999999999),
  invoice_reference text,
  payment_reference text,
  disposed_at timestamptz,
  disposed_by uuid references auth.users(id),
  disposal_attestation text,
  check (serial_number is not null or imei is not null),
  check (not communications_device or imei is not null),
  check (hold_until >= recorded_at + interval '7 days'),
  check (hold_until >= acquired_at + interval '7 days'),
  check (acquisition_type <> 'trade_in' or trade_in_reference is not null),
  check (status <> 'sold' or (buyer_id is not null and disposed_at is not null and sale_amount is not null))
);
create index sh_item_branch_idx on nexus_sh.item(branch_id,recorded_at desc);
create index sh_item_serial_idx on nexus_sh.item(company_id,upper(serial_number));
create index sh_item_imei_idx on nexus_sh.item(company_id,imei);
create table nexus_sh.cost (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references nexus_sh.item(id),
  branch_id uuid not null references public.branch(id),
  category text not null check (category in ('parts','labour','other')),
  description text not null check (length(description) between 3 and 500),
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999),
  service_job_id uuid references public.service_job(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index sh_cost_item_idx on nexus_sh.cost(item_id);
create table nexus_sh.audit (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id),
  item_id uuid references nexus_sh.item(id),
  action text not null,
  actor_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index sh_audit_branch_idx on nexus_sh.audit(branch_id,created_at desc);
create index sh_audit_item_idx on nexus_sh.audit(item_id);

-- These tables intentionally have no Data API grants/policies. Even an authenticated
-- client cannot read PII or mutate the register directly; only the narrow RPCs can.
alter table nexus_sh.access enable row level security;
alter table nexus_sh.policy enable row level security;
alter table nexus_sh.party enable row level security;
alter table nexus_sh.item enable row level security;
alter table nexus_sh.cost enable row level security;
alter table nexus_sh.audit enable row level security;
revoke all on all tables in schema nexus_sh from public, anon, authenticated;
revoke all on all sequences in schema nexus_sh from public, anon, authenticated;

create function nexus_sh.require_access(p_branch uuid, p_roles text[] default array['owner','clerk','auditor'])
returns nexus_sh.access language plpgsql security definer set search_path = '' as $$
declare v_access nexus_sh.access;
begin
  if auth.uid() is null or not exists (select 1 from auth.users u where u.id=auth.uid() and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until <= now())) then
    raise exception 'A valid signed-in staff account is required.' using errcode='42501';
  end if;
  select * into v_access from nexus_sh.access a where a.user_id=auth.uid() and a.branch_id=p_branch and a.revoked_at is null and a.role=any(p_roles) for share;
  if not found then raise exception 'Second-hand access for this branch is not granted.' using errcode='42501'; end if;
  return v_access;
end $$;

create function nexus_sh.required_text(p_data jsonb,p_key text,p_min integer default 1,p_max integer default 500)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := btrim(p_data->>p_key);
begin
 if v is null or length(v)<p_min or length(v)>p_max then raise exception 'Invalid or missing field: %',p_key using errcode='22023'; end if;
 return v;
end $$;
create function nexus_sh.log(p_branch uuid,p_action text,p_item uuid default null,p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
 insert into nexus_sh.audit(branch_id,item_id,action,actor_id,actor_email,details)
 select p_branch,p_item,p_action,auth.uid(),coalesce(u.email,'staff'),p_details from auth.users u where u.id=auth.uid();
$$;
create function nexus_sh.immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Second-hand register evidence is append-only; records cannot be changed or deleted.' using errcode='42501'; end $$;
create trigger sh_audit_immutable before update or delete on nexus_sh.audit for each row execute function nexus_sh.immutable_record();
create trigger sh_party_immutable before update or delete on nexus_sh.party for each row execute function nexus_sh.immutable_record();
create trigger sh_cost_immutable before update or delete on nexus_sh.cost for each row execute function nexus_sh.immutable_record();
create function nexus_sh.item_immutable_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Second-hand acquisition records cannot be deleted.' using errcode='42501'; end if;
 if (to_jsonb(new)-array['status','flag_reason','saps_reference','approved_by','approved_at','released_by','released_at','inventory_item_id','service_job_id','buyer_id','sale_amount','invoice_reference','payment_reference','disposed_at','disposed_by','disposal_attestation'])
   is distinct from (to_jsonb(old)-array['status','flag_reason','saps_reference','approved_by','approved_at','released_by','released_at','inventory_item_id','service_job_id','buyer_id','sale_amount','invoice_reference','payment_reference','disposed_at','disposed_by','disposal_attestation']) then
  raise exception 'Acquisition identity, timestamps, evidence and holding policy are immutable.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger sh_item_immutable before update or delete on nexus_sh.item for each row execute function nexus_sh.item_immutable_fields();

create function nexus_sh.navigation_access() returns boolean language sql security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from nexus_sh.access a join auth.users u on u.id=a.user_id where a.user_id=auth.uid() and a.revoked_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()));
$$;
create function nexus_sh.workspace(p_branch_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_access nexus_sh.access; v_branch uuid; v_branches jsonb; v_policy jsonb;
begin
 if not nexus_sh.navigation_access() then return jsonb_build_object('access_required',true,'branch_id',null,'role',null,'branches','[]'::jsonb,'parties','[]'::jsonb,'items','[]'::jsonb,'audit','[]'::jsonb,'costs','[]'::jsonb,'access','[]'::jsonb); end if;
 select jsonb_agg(jsonb_build_object('id',a.branch_id,'name',a.branch_name) order by a.branch_name) into v_branches from nexus_sh.access a where a.user_id=auth.uid() and a.revoked_at is null;
 select coalesce(p_branch_id,(v_branches->0->>'id')::uuid) into v_branch;
 v_access:=nexus_sh.require_access(v_branch);
 select to_jsonb(p) into v_policy from nexus_sh.policy p where p.branch_id=v_branch;
 v_policy:=coalesce(v_policy,jsonb_build_object('hold_days',8,'legal_review_reference',null,'registration_reference',null,'premises_confirmed',false,'goods_scope_confirmed',false));
 return jsonb_build_object(
  'branch_id',v_branch,'role',v_access.role,'branches',v_branches,'policy',v_policy,'item_count',(select count(*) from nexus_sh.item where branch_id=v_branch),'item_limit',500,
  'parties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'full_name',p.full_name,'id_type',p.id_type,'id_last4',right(p.id_number,4),'verified_at',p.verified_at) order by p.verified_at desc) from nexus_sh.party p where p.branch_id=v_branch),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.recorded_at desc) from (select i.id,i.register_number,i.seller_id,p.full_name seller_name,i.description,i.brand,i.model,i.serial_number,i.imei,i.condition,i.purchase_amount,i.valuation_amount,i.acquired_at,i.recorded_at,i.hold_until,i.status,i.flag_reason,i.saps_reference,i.approved_at,i.inventory_item_id,i.service_job_id,coalesce((select sum(c.amount) from nexus_sh.cost c where c.item_id=i.id),0) refurbishment_cost,i.sale_amount,i.disposed_at,i.buyer_id,i.screening_result,i.acquisition_type,i.trade_in_reference from nexus_sh.item i join nexus_sh.party p on p.id=i.seller_id where i.branch_id=v_branch order by i.recorded_at desc limit 500) q),'[]'::jsonb),
  'costs',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from nexus_sh.cost c where c.branch_id=v_branch),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,item_id,action,actor_id,created_at,details from nexus_sh.audit where branch_id=v_branch order by created_at desc limit 100) a),'[]'::jsonb),
  'access',case when v_access.role='owner' then coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'role',a.role)) from nexus_sh.access a where a.branch_id=v_branch and a.revoked_at is null),'[]'::jsonb) else '[]'::jsonb end
 );
end $$;

create function nexus_sh.action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_branch uuid:=(p_payload->>'branch_id')::uuid; v_access nexus_sh.access; v_policy nexus_sh.policy;
 v_id uuid; v_item nexus_sh.item; v_party nexus_sh.party; v_amount numeric; v_days integer; v_acquired timestamptz;
 v_serial text; v_imei text; v_flag text; v_inventory uuid; v_service uuid; v_user uuid; v_role text; v_dob date;
begin
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then raise exception 'Invalid request payload.' using errcode='22023'; end if;
 v_access:=nexus_sh.require_access(v_branch);
 if p_action in ('approve','release','link_inventory','dispose','policy_update','grant_access','revoke_access') and v_access.role<>'owner' then raise exception 'Owner approval is required.' using errcode='42501'; end if;
 if v_access.role='auditor' then raise exception 'Auditor access is read-only.' using errcode='42501'; end if;
 if p_action='party_create' then
  v_dob:=(p_payload->>'date_of_birth')::date;
  if v_dob is null or v_dob<date '1900-01-01' or v_dob > (now() at time zone 'Africa/Johannesburg')::date - interval '18 years' then raise exception 'Only verified adults (18 or older) may trade.' using errcode='22023'; end if;
  if coalesce((p_payload->>'original_id_sighted')::boolean,false) is not true then raise exception 'Sight the original identity document and retain a secured copy first.' using errcode='22023'; end if;
  if p_payload->>'id_type'='sa_id' and coalesce(p_payload->>'id_number','') !~ '^[0-9]{13}$' then raise exception 'A South African ID must contain 13 digits.' using errcode='22023'; end if;
  insert into nexus_sh.party(company_id,branch_id,kind,full_name,id_type,id_number,date_of_birth,address,phone,original_id_sighted,id_copy_reference,verification_reference,verified_by)
  values(v_access.company_id,v_branch,nexus_sh.required_text(p_payload,'kind'),nexus_sh.required_text(p_payload,'full_name',2,200),nexus_sh.required_text(p_payload,'id_type'),nexus_sh.required_text(p_payload,'id_number',4,40),v_dob,nexus_sh.required_text(p_payload,'address',5,1000),nexus_sh.required_text(p_payload,'phone',5,40),true,nexus_sh.required_text(p_payload,'id_copy_reference',3,300),nexus_sh.required_text(p_payload,'verification_reference',3,500),auth.uid()) returning id into v_id;
  perform nexus_sh.log(v_branch,'party_verified',null,jsonb_build_object('party_id',v_id,'kind',p_payload->>'kind','evidence_storage','secured_physical_copy'));
 elsif p_action='policy_update' then
  v_days:=(p_payload->>'hold_days')::integer;
  if v_days is null or v_days<7 or v_days>365 or not coalesce((p_payload->>'premises_confirmed')::boolean,false) or not coalesce((p_payload->>'goods_scope_confirmed')::boolean,false) then raise exception 'Confirm registered premises/goods scope and a holding period of 7–365 days.' using errcode='22023'; end if;
  insert into nexus_sh.policy(branch_id,company_id,hold_days,legal_review_reference,registration_reference,premises_confirmed,goods_scope_confirmed,reviewed_by)
  values(v_branch,v_access.company_id,v_days,nexus_sh.required_text(p_payload,'legal_review_reference',3,500),nexus_sh.required_text(p_payload,'registration_reference',3,300),true,true,auth.uid())
  on conflict(branch_id) do update set hold_days=excluded.hold_days,legal_review_reference=excluded.legal_review_reference,registration_reference=excluded.registration_reference,premises_confirmed=true,goods_scope_confirmed=true,reviewed_by=auth.uid(),updated_at=now();
  v_id:=v_branch;
  perform nexus_sh.log(v_branch,'policy_reviewed',null,jsonb_build_object('hold_days',v_days,'legal_review_reference',p_payload->>'legal_review_reference','registration_reference',p_payload->>'registration_reference'));
 elsif p_action in ('grant_access','revoke_access') then
  v_user:=(p_payload->>'user_id')::uuid;
  if v_user=auth.uid() or exists(select 1 from nexus_sh.access where user_id=v_user and branch_id=v_branch and role='owner') then raise exception 'Owner access can only be managed by a database administrator.' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and not coalesce(is_anonymous,false)) then raise exception 'Choose an existing authenticated staff account.' using errcode='22023'; end if;
  if p_action='grant_access' then
   v_role:=nexus_sh.required_text(p_payload,'role');
   if v_role not in ('clerk','auditor') then raise exception 'Grant clerk or auditor access.' using errcode='22023'; end if;
   insert into nexus_sh.access(user_id,branch_id,company_id,branch_name,role,granted_by) values(v_user,v_branch,v_access.company_id,v_access.branch_name,v_role,auth.uid()) on conflict(user_id,branch_id) do update set role=excluded.role,revoked_at=null,granted_by=auth.uid(),granted_at=now();
  else update nexus_sh.access set revoked_at=now() where user_id=v_user and branch_id=v_branch; end if;
  v_id:=v_user;
  perform nexus_sh.log(v_branch,p_action,null,jsonb_build_object('user_id',v_user,'role',v_role));
 elsif p_action='acquire' then
  select * into v_policy from nexus_sh.policy where branch_id=v_branch for share;
  if not found or v_policy.registration_reference is null or v_policy.legal_review_reference is null or not v_policy.premises_confirmed or not v_policy.goods_scope_confirmed then raise exception 'Owner must record registration, premises, goods scope and operating/legal review before trading.' using errcode='42501'; end if;
  select * into v_party from nexus_sh.party where id=(p_payload->>'seller_id')::uuid and branch_id=v_branch and kind='seller';
  if not found then raise exception 'A verified seller in this branch is required.' using errcode='22023'; end if;
  v_acquired:=(p_payload->>'acquired_at')::timestamptz;
  if v_acquired is null or v_acquired>now() or v_acquired<now()-interval '5 years' then raise exception 'Acquisition time must be actual, in the past, and within five years.' using errcode='22023'; end if;
  if not coalesce((p_payload->>'ownership_declared')::boolean,false) then raise exception 'Record seller ownership/authority declaration before acquisition.' using errcode='22023'; end if;
  v_serial:=nullif(btrim(p_payload->>'serial_number'),''); v_imei:=nullif(btrim(p_payload->>'imei'),'');
  if v_serial is null and v_imei is null then raise exception 'A serial number or IMEI is required.' using errcode='22023'; end if;
  if v_imei is not null and v_imei !~ '^[0-9]{15}$' then raise exception 'IMEI must contain 15 digits.' using errcode='22023'; end if;
  if coalesce((p_payload->>'communications_device')::boolean,false) and v_imei is null then raise exception 'Communications equipment requires its applicable IMEI.' using errcode='22023'; end if;
  -- Serialize intake per company so duplicate detection cannot race across branches.
  perform pg_advisory_xact_lock(hashtextextended(v_access.company_id::text,2471));
  if exists(select 1 from nexus_sh.item i where i.company_id=v_access.company_id and ((v_serial is not null and upper(i.serial_number)=upper(v_serial)) or (v_imei is not null and i.imei=v_imei))) then raise exception 'This serial/IMEI is already in the register. Owner review is required; repeat intake is blocked.' using errcode='22023'; end if;
  v_flag:=nullif(btrim(p_payload->>'flag_reason'),'');
  if p_payload->>'screening_result' in ('flagged','unknown') then v_flag:=coalesce(v_flag,'Screening is flagged or unresolved. Stop trading and report to SAPS where required.'); end if;
  insert into nexus_sh.item(company_id,branch_id,seller_id,description,brand,model,serial_number,imei,communications_device,condition,purchase_amount,valuation_amount,acquired_at,acquisition_reference,acquisition_type,trade_in_reference,ownership_reference,ownership_declared,screening_result,screening_source,screening_reference,acquired_by,staff_attestation,hold_days,hold_until,policy_snapshot,status,flag_reason)
  values(v_access.company_id,v_branch,v_party.id,nexus_sh.required_text(p_payload,'description',3,1000),nexus_sh.required_text(p_payload,'brand',1,100),nexus_sh.required_text(p_payload,'model',1,150),v_serial,v_imei,coalesce((p_payload->>'communications_device')::boolean,false),nexus_sh.required_text(p_payload,'condition',3,1000),(p_payload->>'purchase_amount')::numeric,(p_payload->>'valuation_amount')::numeric,v_acquired,nexus_sh.required_text(p_payload,'acquisition_reference',3,500),coalesce(p_payload->>'acquisition_type','purchase'),nullif(btrim(p_payload->>'trade_in_reference'),''),nexus_sh.required_text(p_payload,'ownership_reference',3,500),true,nexus_sh.required_text(p_payload,'screening_result'),nexus_sh.required_text(p_payload,'screening_source',3,300),nexus_sh.required_text(p_payload,'screening_reference',3,500),auth.uid(),nexus_sh.required_text(p_payload,'staff_attestation',3,300),v_policy.hold_days,greatest(now(),v_acquired)+make_interval(days=>v_policy.hold_days),to_jsonb(v_policy),case when v_flag is null then 'held' else 'quarantined' end,v_flag) returning id into v_id;
  perform nexus_sh.log(v_branch,case when v_flag is null then 'acquired' else 'quarantined_at_intake' end,v_id,jsonb_build_object('staff_attestation',p_payload->>'staff_attestation','screening_result',p_payload->>'screening_result','hold_days',v_policy.hold_days,'flag_reason',v_flag));
 else
  select * into v_item from nexus_sh.item where id=(p_payload->>'item_id')::uuid and branch_id=v_branch for update;
  if not found then raise exception 'The item is not available in this branch.' using errcode='42501'; end if;
  v_id:=v_item.id;
  if p_action='flag' then
   if v_item.status='sold' then raise exception 'Sold item investigations require a manual incident process; the register remains unchanged.' using errcode='22023'; end if;
   update nexus_sh.item set status='quarantined',flag_reason=nexus_sh.required_text(p_payload,'reason',3,1000) where id=v_id;
   perform nexus_sh.log(v_branch,'quarantined',v_id,jsonb_build_object('reason',p_payload->>'reason','previous_reason',v_item.flag_reason));
  elsif p_action='report_saps' then
   if v_item.status<>'quarantined' then raise exception 'Only quarantined items accept a SAPS report reference.' using errcode='22023'; end if;
   update nexus_sh.item set saps_reference=nexus_sh.required_text(p_payload,'reference',3,500) where id=v_id;
   perform nexus_sh.log(v_branch,'saps_report_recorded',v_id,jsonb_build_object('reference',p_payload->>'reference'));
  elsif p_action='approve' then
   if v_item.status<>'held' or v_item.flag_reason is not null or v_item.screening_result<>'clear' then raise exception 'Only clear, held items can receive owner approval.' using errcode='22023'; end if;
   perform nexus_sh.required_text(p_payload,'staff_attestation',3,300);
   update nexus_sh.item set status='approved',approved_at=now(),approved_by=auth.uid() where id=v_id;
   perform nexus_sh.log(v_branch,'owner_approved',v_id,jsonb_build_object('staff_attestation',p_payload->>'staff_attestation'));
  elsif p_action in ('release','add_cost','link_inventory','dispose') then
   if v_item.flag_reason is not null or v_item.status='quarantined' or v_item.screening_result<>'clear' then raise exception 'Quarantined or unresolved goods cannot be released, altered or sold.' using errcode='42501'; end if;
   if now()<v_item.hold_until then raise exception 'Statutory/conservative holding period has not elapsed; no delivery or refurbishment is allowed.' using errcode='42501'; end if;
   if v_item.approved_at is null then raise exception 'Owner approval is required before release or refurbishment.' using errcode='42501'; end if;
   if p_action='release' then
    if v_item.status<>'approved' then raise exception 'Only an approved item can be released.' using errcode='22023'; end if;
    perform nexus_sh.required_text(p_payload,'staff_attestation',3,300);
    update nexus_sh.item set status='released',released_at=now(),released_by=auth.uid() where id=v_id;
    perform nexus_sh.log(v_branch,'released_after_hold',v_id,jsonb_build_object('staff_attestation',p_payload->>'staff_attestation'));
   elsif p_action='add_cost' then
    if v_item.status not in ('approved','released') then raise exception 'Refurbishment costs require an approved, unsold item.' using errcode='22023'; end if;
    v_service:=nullif(p_payload->>'service_job_id','')::uuid;
    if v_service is not null and not exists(select 1 from public.service_job j where j.id=v_service and j.company_id=v_access.company_id and j.branch_id=v_branch and ((v_item.imei is not null and j.imei=v_item.imei) or (v_item.serial_number is not null and upper(j.serial_number)=upper(v_item.serial_number)))) then raise exception 'Repair job must match this branch, company and device identifier.' using errcode='22023'; end if;
    insert into nexus_sh.cost(item_id,branch_id,category,description,amount,service_job_id,created_by) values(v_id,v_branch,nexus_sh.required_text(p_payload,'category'),nexus_sh.required_text(p_payload,'description',3,500),(p_payload->>'amount')::numeric,v_service,auth.uid());
    if v_service is not null then update nexus_sh.item set service_job_id=v_service where id=v_id; end if;
    if v_item.inventory_item_id is not null then
     update public.inventory_item set cost_price=v_item.purchase_amount+coalesce((select sum(amount) from nexus_sh.cost where item_id=v_id),0) where id=v_item.inventory_item_id;
    end if;
    perform nexus_sh.log(v_branch,'refurbishment_cost_recorded',v_id,jsonb_build_object('amount',(p_payload->>'amount')::numeric,'category',p_payload->>'category','service_job_id',v_service));
   elsif p_action='link_inventory' then
    if v_item.status<>'released' or v_item.inventory_item_id is not null then raise exception 'Release the item first; only one inventory reference is allowed.' using errcode='22023'; end if;
    v_amount:=(p_payload->>'selling_price')::numeric;
    if v_amount is null or v_amount<0 or v_amount>9999999999 then raise exception 'Invalid selling price.' using errcode='22023'; end if;
    -- Custody-reference inventory is deliberately inactive and has no saleable stock.
    -- Ordinary POS remains guarded until a future atomic invoice/buyer integration.
    insert into public.inventory_item(company_id,item_name,sku,description,cost_price,selling_price,minimum_stock,is_active)
    values(v_access.company_id,v_item.brand||' '||v_item.model,v_item.register_number,'Second-hand custody register '||v_item.register_number||'. Dispose only through Second-hand Trading.',v_item.purchase_amount+coalesce((select sum(amount) from nexus_sh.cost where item_id=v_id),0),v_amount,0,false) returning id into v_inventory;
    update nexus_sh.item set inventory_item_id=v_inventory where id=v_id;
    perform nexus_sh.log(v_branch,'inventory_reference_created',v_id,jsonb_build_object('inventory_item_id',v_inventory,'selling_price',v_amount));
   else
    if v_item.status<>'released' then raise exception 'Only a released item can be disposed.' using errcode='22023'; end if;
    select * into v_party from nexus_sh.party where id=(p_payload->>'buyer_id')::uuid and branch_id=v_branch and kind='buyer';
    if not found then raise exception 'A verified buyer in this branch is required.' using errcode='22023'; end if;
    v_amount:=(p_payload->>'sale_amount')::numeric;
    if v_amount is null or v_amount<0 or v_amount>9999999999 then raise exception 'Invalid sale amount.' using errcode='22023'; end if;
    update nexus_sh.item set status='sold',buyer_id=v_party.id,sale_amount=v_amount,invoice_reference=nexus_sh.required_text(p_payload,'invoice_reference',3,300),payment_reference=nexus_sh.required_text(p_payload,'payment_reference',3,300),disposed_at=now(),disposed_by=auth.uid(),disposal_attestation=nexus_sh.required_text(p_payload,'staff_attestation',3,300) where id=v_id;
    perform nexus_sh.log(v_branch,'disposal_recorded',v_id,jsonb_build_object('buyer_id',v_party.id,'sale_amount',v_amount,'staff_attestation',p_payload->>'staff_attestation','accounting','external_invoice_and_payment_reference'));
   end if;
  else raise exception 'Unknown second-hand operation.' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('id',v_id);
end $$;

create function nexus_sh.register_export(p_branch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_access nexus_sh.access; v_result jsonb;
begin
 v_access:=nexus_sh.require_access(p_branch_id,array['owner','auditor']);
 perform nexus_sh.log(p_branch_id,'sensitive_register_export',null,jsonb_build_object('includes_full_identity',true));
 select jsonb_build_object('exported_at',now(),'branch_id',p_branch_id,'policy',(select to_jsonb(p) from nexus_sh.policy p where branch_id=p_branch_id),
 'register',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('seller',to_jsonb(s),'buyer',to_jsonb(b),'costs',coalesce((select jsonb_agg(to_jsonb(c)) from nexus_sh.cost c where c.item_id=i.id),'[]'::jsonb)) order by i.recorded_at) from nexus_sh.item i join nexus_sh.party s on s.id=i.seller_id left join nexus_sh.party b on b.id=i.buyer_id where i.branch_id=p_branch_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from nexus_sh.audit a where a.branch_id=p_branch_id),'[]'::jsonb)) into v_result;
 return v_result;
end $$;

-- Keep every linked device outside ordinary sale/transfer paths. This guard is
-- intentionally scoped to new module-linked items, leaving existing stock alone.
create function nexus_sh.guard_inventory_reference() returns trigger language plpgsql security definer set search_path='' as $$
declare v_inventory uuid; v_link nexus_sh.item;
begin
 if tg_table_name='inventory_item' then v_inventory:=old.id;
 elsif tg_op='DELETE' then v_inventory:=old.inventory_item_id;
 else v_inventory:=new.inventory_item_id; end if;
 select * into v_link from nexus_sh.item where inventory_item_id=v_inventory;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_table_name='inventory_item' then
  if tg_op='UPDATE' then
   if new.id=old.id and new.company_id=old.company_id and new.sku=old.sku and new.is_active=false then return new; end if;
  end if;
 elsif tg_table_name='branch_stock' then
  if tg_op<>'DELETE' then
   if new.quantity=0 and new.branch_id=v_link.branch_id and new.company_id=v_link.company_id then return new; end if;
  end if;
 end if;
 raise exception 'This device is controlled by Second-hand Trading. Use its verified-buyer disposal register; ordinary stock, POS and invoice paths are blocked.' using errcode='42501';
end $$;
create trigger sh_inventory_guard before update or delete on public.inventory_item for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_stock_guard before insert or update or delete on public.branch_stock for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_movement_guard before insert or update or delete on public.stock_movement for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_pos_guard before insert or update on public.pos_sale_item for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_invoice_guard before insert or update on public.invoice_item for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_order_guard before insert or update on public.sales_order_item for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_transfer_guard before insert or update on public.inventory_stock_transfer_item for each row execute function nexus_sh.guard_inventory_reference();
create trigger sh_repair_parts_guard before insert or update on public.service_job_line for each row execute function nexus_sh.guard_inventory_reference();

-- Existing Repairs cannot alter registered devices before release eligibility.
-- Match both OLD and NEW identifiers so changing/removing a serial cannot bypass it.
create function nexus_sh.guard_repair_device() returns trigger language plpgsql security definer set search_path='' as $$
declare v_item nexus_sh.item;
begin
 for v_item in select i.* from nexus_sh.item i where i.status<>'sold' and (
   i.service_job_id=new.id or exists(select 1 from nexus_sh.cost c where c.item_id=i.id and c.service_job_id=new.id) or (tg_op='UPDATE' and (i.service_job_id=old.id or exists(select 1 from nexus_sh.cost c where c.item_id=i.id and c.service_job_id=old.id))) or
   (i.company_id=new.company_id and ((i.imei is not null and i.imei=new.imei) or (i.serial_number is not null and upper(i.serial_number)=upper(new.serial_number))))
   or (tg_op='UPDATE' and i.company_id=old.company_id and ((i.imei is not null and i.imei=old.imei) or (i.serial_number is not null and upper(i.serial_number)=upper(old.serial_number))))) for share loop
  if now()<v_item.hold_until or v_item.approved_at is null or v_item.status='quarantined' or v_item.flag_reason is not null or v_item.branch_id<>new.branch_id or v_item.company_id<>new.company_id then
   raise exception 'Second-hand device hold, owner approval, branch or quarantine prevents repairs.' using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
create trigger sh_repair_device_guard before insert or update on public.service_job for each row execute function nexus_sh.guard_repair_device();

-- Parts/labour RPCs can mutate job lines without updating the parent job.
-- Validate both old and new parent jobs, including explicit immutable register links.
create function nexus_sh.assert_repair_job(p_job_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_job public.service_job; v_item nexus_sh.item;
begin
 select * into v_job from public.service_job where id=p_job_id;
 if not found then return; end if;
 for v_item in select i.* from nexus_sh.item i where i.status<>'sold' and
  (i.service_job_id=v_job.id or exists(select 1 from nexus_sh.cost c where c.item_id=i.id and c.service_job_id=v_job.id) or (i.company_id=v_job.company_id and
   ((i.imei is not null and i.imei=v_job.imei) or (i.serial_number is not null and upper(i.serial_number)=upper(v_job.serial_number))))) for share loop
  if now()<v_item.hold_until or v_item.approved_at is null or v_item.status='quarantined' or v_item.flag_reason is not null or v_item.branch_id<>v_job.branch_id or v_item.company_id<>v_job.company_id then
   raise exception 'Second-hand device hold, owner approval, branch or quarantine prevents repair parts and labour.' using errcode='42501';
  end if;
 end loop;
end $$;
create function nexus_sh.guard_repair_line() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then perform nexus_sh.assert_repair_job(old.service_job_id); end if;
 if tg_op<>'DELETE' then perform nexus_sh.assert_repair_job(new.service_job_id); end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger sh_repair_device_line_guard before insert or update or delete on public.service_job_line for each row execute function nexus_sh.guard_repair_line();

-- Exposed wrappers are invokers. The private functions recheck auth + dedicated
-- branch grants for every operation; clients have no direct register privileges.
create function public.sh_workspace(p_branch_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.workspace(p_branch_id); $$;
create function public.sh_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.action(p_action,p_payload); $$;
create function public.sh_register_export(p_branch_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.register_export(p_branch_id); $$;
create function public.sh_navigation_access() returns boolean language sql security invoker set search_path='' as $$ select nexus_sh.navigation_access(); $$;
revoke all on all functions in schema nexus_sh from public,anon,authenticated;
grant execute on function nexus_sh.workspace(uuid),nexus_sh.action(text,jsonb),nexus_sh.register_export(uuid),nexus_sh.navigation_access() to authenticated;
revoke all on function public.sh_workspace(uuid),public.sh_action(text,jsonb),public.sh_register_export(uuid),public.sh_navigation_access() from public,anon,authenticated;
grant execute on function public.sh_workspace(uuid),public.sh_action(text,jsonb),public.sh_register_export(uuid),public.sh_navigation_access() to authenticated;
insert into public.permissions(permission_name) values ('secondhand.view'),('secondhand.manage'),('secondhand.approve'),('secondhand.export') on conflict(permission_name) do nothing;
comment on schema nexus_sh is 'Private second-hand register; five-year minimum retention requires approved operating procedures. No automated SAPS compliance certification.';
notify pgrst,'reload schema';
