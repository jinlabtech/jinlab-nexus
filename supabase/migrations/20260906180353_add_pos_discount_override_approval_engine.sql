-- Sprint 20.6: Discounts, Overrides & Approvals

insert into public.permissions(permission_name)
values
  ('pos.discount.request'),
  ('pos.discount.approve'),
  ('pos.discount.override')
on conflict(permission_name) do nothing;

-- Cashier: normal discount + request. Manager: same + approval. Owner/Admin: full approval/override.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.discount','pos.discount.request')
where r.role_name='cashier'
  and not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.discount','pos.discount.request','pos.discount.approve')
where r.role_name='manager'
  and not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.discount.request','pos.discount.approve','pos.discount.override')
where r.role_name in ('owner','admin')
  and not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id);

create table if not exists public.pos_approval_request(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  request_type text not null check(request_type in ('discount','price_override')),
  status text not null default 'pending' check(status in ('pending','approved','rejected','used','cancelled','expired')),
  required_level text not null check(required_level in ('manager','owner')),
  requested_by uuid not null,
  reviewed_by uuid null,
  used_by uuid null,
  reason text not null,
  review_notes text null,
  requested_max_discount_pct numeric(8,4) not null default 0 check(requested_max_discount_pct>=0),
  requested_discount_amount numeric(14,2) not null default 0 check(requested_discount_amount>=0),
  cart_snapshot jsonb not null,
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  approved_at timestamptz null,
  reviewed_at timestamptz null,
  used_at timestamptz null,
  used_pos_sale_id uuid null references public.pos_sale(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_approval_request_company_branch_status_idx
  on public.pos_approval_request(company_id,branch_id,status,created_at desc);
create index if not exists pos_approval_request_requester_idx
  on public.pos_approval_request(company_id,requested_by,created_at desc);

alter table public.pos_approval_request enable row level security;
revoke all on public.pos_approval_request from anon,authenticated;

create or replace function public.normalize_pos_approval_items(p_items jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'inventory_item_id', x.inventory_item_id,
      'quantity', x.quantity,
      'discount_mode', x.discount_mode,
      'discount_value', x.discount_value,
      'requested_unit_price', x.requested_unit_price
    ) order by x.inventory_item_id::text
  ),'[]'::jsonb)
  from (
    select
      (value->>'inventory_item_id')::uuid as inventory_item_id,
      round(coalesce(nullif(value->>'quantity','')::numeric,0),3) as quantity,
      coalesce(nullif(value->>'discount_mode',''),'percentage') as discount_mode,
      round(coalesce(nullif(value->>'discount_value','')::numeric,0),2) as discount_value,
      case when nullif(value->>'requested_unit_price','') is null then null
           else round((value->>'requested_unit_price')::numeric,2) end as requested_unit_price
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  ) x;
$function$;

create or replace function public.request_pos_approval(
  p_branch_id uuid,
  p_items jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_item jsonb;
  v_inventory public.inventory_item%rowtype;
  v_qty numeric(14,3);
  v_discount_mode text;
  v_discount_value numeric(14,2);
  v_requested_price numeric(14,2);
  v_line_base numeric(14,2);
  v_final_line numeric(14,2);
  v_effective_pct numeric(8,4);
  v_max_pct numeric(8,4):=0;
  v_total_discount numeric(14,2):=0;
  v_has_price_override boolean:=false;
  v_has_discount boolean:=false;
  v_required_level text;
  v_request_type text;
  v_request_id uuid;
  v_reason text:=trim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.discount.request') then raise exception 'Permission denied: pos.discount.request'; end if;
  if v_reason='' or length(v_reason)<3 then raise exception 'A clear approval reason is required.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty.'; end if;

  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;

  insert into public.company_pos_settings(company_id) values(v_company_id) on conflict(company_id) do nothing;
  select * into v_settings from public.company_pos_settings where company_id=v_company_id;
  select * into v_template from public.pos_profile_template where profile_key=v_settings.profile_key and is_active=true;
  v_capabilities:=coalesce(v_template.capabilities,'{}'::jsonb)||coalesce(v_settings.capability_overrides,'{}'::jsonb);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_inventory
    from public.inventory_item
    where id=(v_item->>'inventory_item_id')::uuid and company_id=v_company_id and is_active=true;
    if not found then raise exception 'One or more cart items could not be found.'; end if;

    v_qty:=round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'Approval cart quantities must be positive whole numbers.'; end if;

    v_discount_mode:=coalesce(nullif(v_item->>'discount_mode',''),'percentage');
    v_discount_value:=round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);
    if v_discount_mode not in ('percentage','fixed') or v_discount_value<0 then raise exception 'Invalid discount request.'; end if;

    v_requested_price:=case when nullif(v_item->>'requested_unit_price','') is null then null else round((v_item->>'requested_unit_price')::numeric,2) end;
    v_line_base:=round(v_inventory.selling_price*v_qty,2);

    if v_requested_price is not null then
      if coalesce((v_capabilities->>'price_override')::boolean,false)=false then raise exception 'Price override is disabled for this POS profile.'; end if;
      if v_requested_price<=0 then raise exception 'Override price must be greater than zero.'; end if;
      if v_discount_value>0 then raise exception 'Use either a price override or a discount on a line, not both.'; end if;
      v_has_price_override:=true;
      v_final_line:=round(v_requested_price*v_qty,2);
    else
      v_final_line:=v_line_base;
      if v_discount_value>0 then
        if coalesce((v_capabilities->>'discounts')::boolean,false)=false then raise exception 'Discounts are disabled for this POS profile.'; end if;
        v_has_discount:=true;
        if v_discount_mode='percentage' then
          if v_discount_value>100 then raise exception 'Discount cannot exceed 100 percent.'; end if;
          v_final_line:=round(v_line_base*(1-v_discount_value/100),2);
        else
          if v_discount_value>=v_line_base then raise exception 'Fixed discount must be less than the line value.'; end if;
          v_final_line:=round(v_line_base-v_discount_value,2);
        end if;
      end if;
    end if;

    v_effective_pct:=case when v_line_base=0 then 0 else round(greatest((v_line_base-v_final_line)/v_line_base*100,0),4) end;
    v_max_pct:=greatest(v_max_pct,v_effective_pct);
    v_total_discount:=round(v_total_discount+greatest(v_line_base-v_final_line,0),2);
  end loop;

  if not v_has_discount and not v_has_price_override then
    return jsonb_build_object('ok',true,'approval_required',false,'message','No approval is required because the cart has no discount or price override.');
  end if;

  if not v_has_price_override and v_max_pct<=v_settings.max_cashier_discount_pct then
    return jsonb_build_object(
      'ok',true,'approval_required',false,
      'max_discount_pct',v_max_pct,
      'cashier_limit_pct',v_settings.max_cashier_discount_pct,
      'message','Discount is within the self-service POS limit.'
    );
  end if;

  if v_has_price_override then
    v_required_level:='owner';
    v_request_type:='price_override';
  elsif v_max_pct<=v_settings.supervisor_discount_threshold_pct then
    v_required_level:='manager';
    v_request_type:='discount';
  else
    v_required_level:='owner';
    v_request_type:='discount';
  end if;

  -- expire old pending requests from this requester/branch so stale approvals are not reused accidentally
  update public.pos_approval_request
  set status='expired',updated_at=now()
  where company_id=v_company_id and branch_id=p_branch_id and requested_by=auth.uid()
    and status='pending' and expires_at<=now();

  insert into public.pos_approval_request(
    company_id,branch_id,request_type,status,required_level,requested_by,reason,
    requested_max_discount_pct,requested_discount_amount,cart_snapshot,expires_at
  ) values(
    v_company_id,p_branch_id,v_request_type,'pending',v_required_level,auth.uid(),v_reason,
    v_max_pct,v_total_discount,public.normalize_pos_approval_items(p_items),now()+interval '15 minutes'
  ) returning id into v_request_id;

  return jsonb_build_object(
    'ok',true,'approval_required',true,'approval_id',v_request_id,
    'request_type',v_request_type,'required_level',v_required_level,
    'max_discount_pct',v_max_pct,'discount_amount',v_total_discount,
    'expires_at',now()+interval '15 minutes',
    'message',case when v_required_level='manager' then 'Manager approval requested.' else 'Owner/Admin approval requested.' end
  );
end;
$function$;

create or replace function public.get_pos_approval_workspace(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_branch_id uuid:=p_branch_id;
  v_pending jsonb;
  v_mine jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not (public.current_user_has_permission('pos.discount.request') or public.current_user_has_permission('pos.discount.approve')) then
    raise exception 'Permission denied: POS approvals';
  end if;

  v_company_id:=public.current_company_id();
  if v_branch_id is not null and not exists(select 1 from public.branch where id=v_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;

  update public.pos_approval_request
  set status='expired',updated_at=now()
  where company_id=v_company_id and status in ('pending','approved') and expires_at<=now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'branch_id',r.branch_id,'branch_name',b.branch_name,'request_type',r.request_type,
    'status',r.status,'required_level',r.required_level,'requested_by',r.requested_by,
    'requested_by_name',coalesce(up.full_name,up.email,'Unknown'),'reason',r.reason,
    'max_discount_pct',r.requested_max_discount_pct,'discount_amount',r.requested_discount_amount,
    'cart_snapshot',r.cart_snapshot,'expires_at',r.expires_at,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_pending
  from public.pos_approval_request r
  join public.branch b on b.id=r.branch_id and b.company_id=r.company_id
  left join public.user_profile up on up.user_id=r.requested_by and up.company_id=r.company_id
  where r.company_id=v_company_id
    and r.status='pending'
    and (v_branch_id is null or r.branch_id=v_branch_id)
    and public.current_user_has_permission('pos.discount.approve');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'branch_id',r.branch_id,'branch_name',b.branch_name,'request_type',r.request_type,
    'status',r.status,'required_level',r.required_level,'reason',r.reason,
    'max_discount_pct',r.requested_max_discount_pct,'discount_amount',r.requested_discount_amount,
    'expires_at',r.expires_at,'review_notes',r.review_notes,'created_at',r.created_at,
    'reviewed_at',r.reviewed_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_mine
  from public.pos_approval_request r
  join public.branch b on b.id=r.branch_id and b.company_id=r.company_id
  where r.company_id=v_company_id and r.requested_by=auth.uid()
    and (v_branch_id is null or r.branch_id=v_branch_id)
  limit 30;

  return jsonb_build_object(
    'ok',true,
    'pending',coalesce(v_pending,'[]'::jsonb),
    'my_requests',coalesce(v_mine,'[]'::jsonb),
    'can_approve',public.current_user_has_permission('pos.discount.approve'),
    'can_owner_override',public.current_user_has_permission('pos.discount.override')
  );
end;
$function$;

create or replace function public.review_pos_approval(
  p_approval_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_request public.pos_approval_request%rowtype;
  v_decision text:=lower(trim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.discount.approve') then raise exception 'Permission denied: pos.discount.approve'; end if;
  if v_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected.'; end if;

  v_company_id:=public.current_company_id();
  select * into v_request
  from public.pos_approval_request
  where id=p_approval_id and company_id=v_company_id
  for update;

  if not found then raise exception 'Approval request could not be found.'; end if;
  if v_request.status<>'pending' then raise exception 'Approval request is no longer pending.'; end if;
  if v_request.expires_at<=now() then
    update public.pos_approval_request set status='expired',updated_at=now() where id=v_request.id;
    raise exception 'Approval request has expired.';
  end if;

  if v_request.required_level='owner' and not public.current_user_has_permission('pos.discount.override') then
    raise exception 'Owner/Admin approval is required for this request.';
  end if;

  if v_request.requested_by=auth.uid() and not public.current_user_has_permission('pos.discount.override') then
    raise exception 'You cannot approve your own POS override request.';
  end if;

  update public.pos_approval_request
  set status=v_decision,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      approved_at=case when v_decision='approved' then now() else null end,
      review_notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_request.id;

  return jsonb_build_object(
    'ok',true,'approval_id',v_request.id,'status',v_decision,
    'message',case when v_decision='approved' then 'POS request approved for this exact cart. It expires in 15 minutes and can be used once.' else 'POS request rejected.' end
  );
end;
$function$;

create or replace function public.cancel_pos_approval(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_request public.pos_approval_request%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_request from public.pos_approval_request where id=p_approval_id and company_id=v_company_id for update;
  if not found then raise exception 'Approval request could not be found.'; end if;
  if v_request.requested_by<>auth.uid() and not public.current_user_has_permission('pos.discount.override') then raise exception 'You cannot cancel this approval request.'; end if;
  if v_request.status not in ('pending','approved') then raise exception 'Only pending or approved requests can be cancelled.'; end if;
  update public.pos_approval_request set status='cancelled',updated_at=now() where id=v_request.id;
  return jsonb_build_object('ok',true,'approval_id',v_request.id,'status','cancelled');
end;
$function$;

grant execute on function public.request_pos_approval(uuid,jsonb,text) to authenticated;
grant execute on function public.get_pos_approval_workspace(uuid) to authenticated;
grant execute on function public.review_pos_approval(uuid,text,text) to authenticated;
grant execute on function public.cancel_pos_approval(uuid) to authenticated;

-- Replace checkout with approval-aware logic. Approval id is carried inside p_items as approval_id,
-- preserving the existing RPC signature and preventing an old-signature bypass.
create or replace function public.checkout_pos_sale(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'cash',
  p_amount_tendered numeric default null,
  p_reference text default null,
  p_suspended_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_pos_sale_id uuid;
  v_invoice_number text;
  v_sale_number text;
  v_item jsonb;
  v_inventory public.inventory_item%rowtype;
  v_qty numeric(14,3);
  v_discount_mode text;
  v_discount_value numeric(14,2);
  v_catalogue_price numeric(14,2);
  v_requested_price numeric(14,2);
  v_effective_price numeric(14,2);
  v_invoice_price numeric(14,6);
  v_tax_mode text;
  v_tax_rate numeric(8,4):=0;
  v_vat_registered boolean:=false;
  v_prices_include_vat boolean:=false;
  v_total numeric(14,2);
  v_tendered numeric(14,2);
  v_change numeric(14,2):=0;
  v_invoice_item_id uuid;
  v_line_total numeric(14,2);
  v_costing_enabled boolean:=false;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_discount_pct numeric(8,4);
  v_line_base numeric(14,2);
  v_final_line numeric(14,2);
  v_effective_reduction_pct numeric(8,4);
  v_hold public.pos_suspended_sale%rowtype;
  v_approval_id uuid;
  v_approval public.pos_approval_request%rowtype;
  v_approval_needed boolean:=false;
  v_has_override boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.sell') then raise exception 'Permission denied: pos.sell'; end if;
  if p_payment_method not in ('cash','eft','card','other') then raise exception 'Invalid POS payment method.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one item to the POS cart.'; end if;

  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;

  insert into public.company_pos_settings(company_id) values(v_company_id) on conflict(company_id) do nothing;
  select * into v_settings from public.company_pos_settings where company_id=v_company_id;
  select * into v_template from public.pos_profile_template where profile_key=v_settings.profile_key and is_active=true;
  v_capabilities:=coalesce(v_template.capabilities,'{}'::jsonb)||coalesce(v_settings.capability_overrides,'{}'::jsonb);

  if not v_settings.enabled then raise exception 'POS is disabled in company settings.'; end if;

  if p_suspended_sale_id is not null then
    select * into v_hold from public.pos_suspended_sale
    where id=p_suspended_sale_id and company_id=v_company_id and status='suspended' for update;
    if not found then raise exception 'The suspended sale is no longer available.'; end if;
    if v_hold.branch_id<>p_branch_id then raise exception 'The suspended sale belongs to another branch.'; end if;
    if v_hold.cashier_user_id<>auth.uid() and not public.current_user_has_permission('pos.suspended.manage') then raise exception 'You cannot complete another cashier''s suspended sale.'; end if;
  end if;

  -- Determine whether this cart requires approval and collect the single approval id.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_inventory from public.inventory_item
    where id=(v_item->>'inventory_item_id')::uuid and company_id=v_company_id and is_active=true;
    if not found then raise exception 'One or more POS items could not be found.'; end if;

    v_qty:=round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'Current POS inventory items must use positive whole-number quantities.'; end if;

    v_catalogue_price:=round(v_inventory.selling_price,2);
    if v_catalogue_price<=0 then raise exception 'POS cannot sell % because its selling price is zero.',v_inventory.item_name; end if;

    v_discount_mode:=coalesce(nullif(v_item->>'discount_mode',''),'percentage');
    v_discount_value:=round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);
    if v_discount_mode not in ('percentage','fixed') or v_discount_value<0 then raise exception 'Invalid discount.'; end if;

    v_requested_price:=case when nullif(v_item->>'requested_unit_price','') is null then null else round((v_item->>'requested_unit_price')::numeric,2) end;
    v_line_base:=round(v_catalogue_price*v_qty,2);

    if v_requested_price is not null then
      if coalesce((v_capabilities->>'price_override')::boolean,false)=false then raise exception 'Price override is disabled for this POS profile.'; end if;
      if v_requested_price<=0 then raise exception 'Override price must be greater than zero.'; end if;
      if v_discount_value>0 then raise exception 'Use either a price override or a discount on a line, not both.'; end if;
      v_has_override:=true;
      v_final_line:=round(v_requested_price*v_qty,2);
      v_approval_needed:=true;
    else
      v_final_line:=v_line_base;
      if v_discount_value>0 then
        if coalesce((v_capabilities->>'discounts')::boolean,false)=false then raise exception 'Discounts are disabled for this POS profile.'; end if;
        if not public.current_user_has_permission('pos.discount') then raise exception 'Permission denied: pos.discount'; end if;
        if v_discount_mode='percentage' then
          if v_discount_value>100 then raise exception 'Discount cannot exceed 100 percent.'; end if;
          v_final_line:=round(v_line_base*(1-v_discount_value/100),2);
        else
          if v_discount_value>=v_line_base then raise exception 'Fixed discount must be less than the line value.'; end if;
          v_final_line:=round(v_line_base-v_discount_value,2);
        end if;
      end if;
    end if;

    v_effective_reduction_pct:=case when v_line_base=0 then 0 else round(greatest((v_line_base-v_final_line)/v_line_base*100,0),4) end;
    if v_effective_reduction_pct>v_settings.max_cashier_discount_pct then v_approval_needed:=true; end if;

    if nullif(v_item->>'approval_id','') is not null then
      if v_approval_id is null then v_approval_id:=(v_item->>'approval_id')::uuid;
      elsif v_approval_id<>(v_item->>'approval_id')::uuid then raise exception 'A POS cart can use only one approval request.'; end if;
    end if;
  end loop;

  if v_approval_needed then
    if v_approval_id is null then raise exception 'This discount or price override requires approval before checkout.'; end if;

    select * into v_approval from public.pos_approval_request
    where id=v_approval_id and company_id=v_company_id for update;
    if not found then raise exception 'POS approval could not be found.'; end if;
    if v_approval.branch_id<>p_branch_id then raise exception 'POS approval belongs to another branch.'; end if;
    if v_approval.status<>'approved' then raise exception 'POS approval is not approved.'; end if;
    if v_approval.expires_at<=now() then
      update public.pos_approval_request set status='expired',updated_at=now() where id=v_approval.id;
      raise exception 'POS approval has expired. Request approval again.';
    end if;
    if v_approval.cart_snapshot<>public.normalize_pos_approval_items(p_items) then raise exception 'The POS cart changed after approval. Request approval again for the current cart.'; end if;
    if v_has_override and v_approval.request_type<>'price_override' then raise exception 'A price override requires an Owner/Admin price-override approval.'; end if;
  elsif v_approval_id is not null then
    raise exception 'This cart does not require the supplied approval. Remove the stale approval and continue.';
  end if;

  select coalesce(enabled,false) into v_costing_enabled from public.company_inventory_costing_settings where company_id=v_company_id;
  if not v_costing_enabled then raise exception 'Inventory costing must be active before POS can sell stock.'; end if;

  select coalesce(vat_registered,false),coalesce(default_vat_rate,0),coalesce(prices_include_vat,false)
  into v_vat_registered,v_tax_rate,v_prices_include_vat from public.company_finance_settings where company_id=v_company_id;
  v_tax_mode:=case when v_vat_registered and v_tax_rate>0 then 'vat' else 'none' end;

  if p_customer_id is null then
    if v_settings.require_customer then raise exception 'This POS profile requires a customer on every sale.'; end if;
    if not v_settings.allow_walk_in_customer then raise exception 'Walk-in customer sales are disabled.'; end if;
    v_customer_id:=public.ensure_pos_walk_in_customer(v_company_id);
  else
    select id into v_customer_id from public.customer where id=p_customer_id and company_id=v_company_id and is_active=true;
    if v_customer_id is null then raise exception 'Customer could not be found.'; end if;
  end if;

  v_invoice_id:=gen_random_uuid();
  v_invoice_number:=public.generate_invoice_number(v_company_id);
  insert into public.invoice(id,company_id,branch_id,customer_id,invoice_number,status,invoice_date,due_date,notes,created_by)
  values(v_invoice_id,v_company_id,p_branch_id,v_customer_id,v_invoice_number,'draft',current_date,current_date,'JINLAB Nexus POS sale',auth.uid());

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_inventory from public.inventory_item where id=(v_item->>'inventory_item_id')::uuid and company_id=v_company_id and is_active=true;
    v_qty:=round((v_item->>'quantity')::numeric,3);
    if coalesce((select quantity from public.branch_stock where company_id=v_company_id and branch_id=p_branch_id and inventory_item_id=v_inventory.id),0)<v_qty then raise exception 'Insufficient stock for %.',v_inventory.item_name; end if;

    v_catalogue_price:=round(v_inventory.selling_price,2);
    v_requested_price:=case when nullif(v_item->>'requested_unit_price','') is null then null else round((v_item->>'requested_unit_price')::numeric,2) end;
    v_effective_price:=coalesce(v_requested_price,v_catalogue_price);
    v_discount_mode:=coalesce(nullif(v_item->>'discount_mode',''),'percentage');
    v_discount_value:=round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);

    v_invoice_price:=case when v_tax_mode='vat' and v_prices_include_vat then round(v_effective_price/(1+(v_tax_rate/100)),6) else v_effective_price end;

    insert into public.invoice_item(invoice_id,company_id,inventory_item_id,description,quantity,unit_price,discount_mode,discount_value,tax_mode,tax_rate)
    values(v_invoice_id,v_company_id,v_inventory.id,v_inventory.item_name,v_qty,v_invoice_price,v_discount_mode,v_discount_value,v_tax_mode,v_tax_rate)
    returning id,line_total into v_invoice_item_id,v_line_total;
  end loop;

  select total_amount into v_total from public.invoice where id=v_invoice_id;
  if v_total<=0 then raise exception 'POS sale total must be greater than zero.'; end if;

  v_tendered:=round(coalesce(p_amount_tendered,v_total),2);
  if p_payment_method='cash' then
    if v_tendered<v_total then raise exception 'Cash tendered is less than the sale total.'; end if;
    v_change:=round(v_tendered-v_total,2);
  else
    if abs(v_tendered-v_total)>0.009 then raise exception 'Card, EFT and other POS payments must equal the sale total.'; end if;
    v_change:=0;
  end if;

  update public.invoice set status='issued',due_date=current_date,updated_at=now() where id=v_invoice_id;

  insert into public.invoice_payment(company_id,branch_id,invoice_id,customer_id,payment_date,payment_method,reference,amount,notes,received_by,payment_source)
  values(v_company_id,p_branch_id,v_invoice_id,v_customer_id,current_date,p_payment_method,nullif(trim(coalesce(p_reference,'')),''),v_total,'JINLAB Nexus POS payment',auth.uid(),'pos') returning id into v_payment_id;

  v_pos_sale_id:=gen_random_uuid();
  v_sale_number:=public.generate_pos_sale_number(v_company_id);
  insert into public.pos_sale(id,company_id,branch_id,sale_number,invoice_id,payment_id,customer_id,cashier_user_id,payment_method,amount_tendered,total_amount,change_due,reference,status,metadata)
  values(
    v_pos_sale_id,v_company_id,p_branch_id,v_sale_number,v_invoice_id,v_payment_id,v_customer_id,auth.uid(),
    p_payment_method,v_tendered,v_total,v_change,nullif(trim(coalesce(p_reference,'')),''),'completed',
    jsonb_strip_nulls(jsonb_build_object('source','pos_checkout','profile_key',v_settings.profile_key,'suspended_sale_id',p_suspended_sale_id,'approval_id',v_approval_id))
  );

  insert into public.pos_sale_item(company_id,pos_sale_id,invoice_item_id,inventory_item_id,description,quantity,catalogue_unit_price,invoice_unit_price,discount_mode,discount_value,line_total)
  select v_company_id,v_pos_sale_id,ii.id,ii.inventory_item_id,ii.description,ii.quantity,inv.selling_price,ii.unit_price,ii.discount_mode,ii.discount_value,ii.line_total
  from public.invoice_item ii join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id where ii.invoice_id=v_invoice_id;

  if p_suspended_sale_id is not null then
    update public.pos_suspended_sale set status='completed',completed_pos_sale_id=v_pos_sale_id,completed_at=now(),updated_at=now()
    where id=p_suspended_sale_id and company_id=v_company_id and status='suspended';
    if not found then raise exception 'Suspended sale completion could not be recorded.'; end if;
  end if;

  if v_approval_id is not null then
    update public.pos_approval_request
    set status='used',used_by=auth.uid(),used_at=now(),used_pos_sale_id=v_pos_sale_id,updated_at=now()
    where id=v_approval_id and company_id=v_company_id and status='approved';
    if not found then raise exception 'POS approval could not be consumed.'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,'pos_sale_id',v_pos_sale_id,'sale_number',v_sale_number,'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,'payment_id',v_payment_id,'total',v_total,'amount_tendered',v_tendered,
    'change_due',v_change,'payment_method',p_payment_method,'profile_key',v_settings.profile_key,
    'suspended_sale_id',p_suspended_sale_id,'approval_id',v_approval_id,
    'message','POS sale completed. Invoice, payment, stock, Cost of Sales and Accounting were updated automatically.'
  );
end;
$function$;;
