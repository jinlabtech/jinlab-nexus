alter table public.pos_sale alter column payment_id drop not null;

alter table public.pos_sale drop constraint if exists pos_sale_payment_method_check;
alter table public.pos_sale add constraint pos_sale_payment_method_check
check (payment_method = any (array['cash'::text,'eft'::text,'card'::text,'other'::text,'split'::text]));

create table if not exists public.pos_sale_tender (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sale(id) on delete cascade,
  invoice_payment_id uuid not null references public.invoice_payment(id) on delete restrict,
  payment_method text not null check (payment_method in ('cash','card','eft','other')),
  amount numeric(14,2) not null check (amount > 0),
  amount_tendered numeric(14,2) not null check (amount_tendered >= amount),
  change_due numeric(14,2) not null default 0 check (change_due >= 0),
  reference text null,
  created_at timestamptz not null default now(),
  unique(invoice_payment_id),
  unique(pos_sale_id,payment_method)
);

alter table public.pos_sale_tender enable row level security;
revoke all on public.pos_sale_tender from anon, authenticated;

insert into public.pos_sale_tender(
  company_id,pos_sale_id,invoice_payment_id,payment_method,amount,amount_tendered,change_due,reference
)
select ps.company_id,ps.id,ps.payment_id,ps.payment_method,ps.total_amount,ps.amount_tendered,ps.change_due,ps.reference
from public.pos_sale ps
where ps.payment_id is not null
  and ps.payment_method in ('cash','card','eft','other')
  and not exists (
    select 1 from public.pos_sale_tender pst where pst.pos_sale_id=ps.id
  )
on conflict do nothing;

update public.pos_profile_template
set capabilities=jsonb_set(coalesce(capabilities,'{}'::jsonb),'{split_tender}','true'::jsonb,true)
where is_active=true;

create or replace function public.get_pos_till_session_totals(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_session public.pos_till_session%rowtype;
  v_cash numeric(14,2):=0;
  v_card numeric(14,2):=0;
  v_eft numeric(14,2):=0;
  v_other numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;
  v_company_id:=public.current_company_id();

  select * into v_session
  from public.pos_till_session
  where id=p_session_id and company_id=v_company_id;

  if not found then raise exception 'Till session could not be found.'; end if;

  select
    coalesce(sum(pst.amount) filter(where pst.payment_method='cash'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='card'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='eft'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='other'),0),
    coalesce(sum(ps.total_amount),0),
    count(distinct ps.id)
  into v_cash,v_card,v_eft,v_other,v_total,v_count
  from public.pos_sale ps
  left join public.pos_sale_tender pst
    on pst.pos_sale_id=ps.id and pst.company_id=ps.company_id
  where ps.company_id=v_company_id
    and ps.till_session_id=p_session_id
    and ps.status='completed';

  return jsonb_build_object(
    'session_id',v_session.id,
    'opening_float',v_session.opening_float,
    'cash_sales',round(v_cash,2),
    'card_sales',round(v_card,2),
    'eft_sales',round(v_eft,2),
    'other_sales',round(v_other,2),
    'gross_sales',round(v_total,2),
    'transaction_count',v_count,
    'expected_cash',round(v_session.opening_float+v_cash,2)
  );
end;
$function$;

drop function if exists public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid);

create function public.checkout_pos_sale(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'cash',
  p_amount_tendered numeric default null,
  p_reference text default null,
  p_suspended_sale_id uuid default null,
  p_tenders jsonb default null
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
  v_first_payment_id uuid;
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
  v_invoice_item_id uuid;
  v_line_total numeric(14,2);
  v_costing_enabled boolean:=false;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_line_base numeric(14,2);
  v_final_line numeric(14,2);
  v_effective_reduction_pct numeric(8,4);
  v_hold public.pos_suspended_sale%rowtype;
  v_approval_id uuid;
  v_approval public.pos_approval_request%rowtype;
  v_approval_needed boolean:=false;
  v_has_override boolean:=false;
  v_tenders jsonb;
  v_tender jsonb;
  v_tender_count integer:=0;
  v_method text;
  v_amount numeric(14,2);
  v_tendered numeric(14,2);
  v_change numeric(14,2);
  v_sum_amount numeric(14,2):=0;
  v_sum_tendered numeric(14,2):=0;
  v_sum_change numeric(14,2):=0;
  v_sale_payment_method text;
  v_tender_reference text;
  v_tender_breakdown jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.sell') then raise exception 'Permission denied: pos.sell'; end if;
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
    select * into v_approval from public.pos_approval_request where id=v_approval_id and company_id=v_company_id for update;
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

  if p_tenders is null or jsonb_typeof(p_tenders)<>'array' or jsonb_array_length(p_tenders)=0 then
    if p_payment_method not in ('cash','card','eft','other') then raise exception 'Invalid POS payment method.'; end if;
    v_tenders:=jsonb_build_array(jsonb_build_object(
      'payment_method',p_payment_method,
      'amount',v_total,
      'amount_tendered',case when p_payment_method='cash' then coalesce(p_amount_tendered,v_total) else v_total end,
      'reference',nullif(trim(coalesce(p_reference,'')),'')
    ));
  else
    if jsonb_typeof(p_tenders)<>'array' then raise exception 'POS tenders must be an array.'; end if;
    v_tenders:=p_tenders;
  end if;

  v_tender_count:=jsonb_array_length(v_tenders);
  if v_tender_count<1 or v_tender_count>4 then raise exception 'POS supports between one and four tender methods per sale.'; end if;
  if v_tender_count>1 and coalesce((v_capabilities->>'split_tender')::boolean,false)=false then raise exception 'Split tender is disabled for this POS profile.'; end if;

  if (select count(*) from jsonb_array_elements(v_tenders))<>(select count(distinct lower(trim(value->>'payment_method'))) from jsonb_array_elements(v_tenders)) then
    raise exception 'Use each payment method only once in a split payment.';
  end if;

  for v_tender in select value from jsonb_array_elements(v_tenders)
  loop
    v_method:=lower(trim(coalesce(v_tender->>'payment_method','')));
    if v_method not in ('cash','card','eft','other') then raise exception 'Invalid POS tender method.'; end if;
    v_amount:=round(coalesce(nullif(v_tender->>'amount','')::numeric,0),2);
    if v_amount<=0 then raise exception 'Every POS tender amount must be greater than zero.'; end if;
    v_tendered:=round(coalesce(nullif(v_tender->>'amount_tendered','')::numeric,v_amount),2);
    if v_method='cash' then
      if v_tendered<v_amount then raise exception 'Cash tendered cannot be less than the cash portion.'; end if;
      v_change:=round(v_tendered-v_amount,2);
    else
      if abs(v_tendered-v_amount)>0.009 then raise exception 'Card, EFT and other tendered amounts must equal their applied amount.'; end if;
      v_change:=0;
    end if;
    v_sum_amount:=round(v_sum_amount+v_amount,2);
    v_sum_tendered:=round(v_sum_tendered+v_tendered,2);
    v_sum_change:=round(v_sum_change+v_change,2);
  end loop;

  if abs(v_sum_amount-v_total)>0.009 then raise exception 'Split tender total % must equal sale total %.',v_sum_amount,v_total; end if;
  v_sale_payment_method:=case when v_tender_count>1 then 'split' else lower(trim((v_tenders->0)->>'payment_method')) end;

  update public.invoice set status='issued',due_date=current_date,updated_at=now() where id=v_invoice_id;

  v_pos_sale_id:=gen_random_uuid();
  v_sale_number:=public.generate_pos_sale_number(v_company_id);
  insert into public.pos_sale(id,company_id,branch_id,sale_number,invoice_id,payment_id,customer_id,cashier_user_id,payment_method,amount_tendered,total_amount,change_due,reference,status,metadata)
  values(
    v_pos_sale_id,v_company_id,p_branch_id,v_sale_number,v_invoice_id,null,v_customer_id,auth.uid(),
    v_sale_payment_method,v_sum_tendered,v_total,v_sum_change,nullif(trim(coalesce(p_reference,'')),''),'completed',
    jsonb_strip_nulls(jsonb_build_object('source','pos_checkout','profile_key',v_settings.profile_key,'suspended_sale_id',p_suspended_sale_id,'approval_id',v_approval_id,'tender_count',v_tender_count))
  );

  for v_tender in select value from jsonb_array_elements(v_tenders)
  loop
    v_method:=lower(trim(v_tender->>'payment_method'));
    v_amount:=round((v_tender->>'amount')::numeric,2);
    v_tendered:=round(coalesce(nullif(v_tender->>'amount_tendered','')::numeric,v_amount),2);
    v_change:=case when v_method='cash' then round(v_tendered-v_amount,2) else 0 end;
    v_tender_reference:=nullif(trim(coalesce(v_tender->>'reference','')),'');

    insert into public.invoice_payment(company_id,branch_id,invoice_id,customer_id,payment_date,payment_method,reference,amount,notes,received_by,payment_source)
    values(v_company_id,p_branch_id,v_invoice_id,v_customer_id,current_date,v_method,v_tender_reference,v_amount,'JINLAB Nexus POS tender',auth.uid(),'pos')
    returning id into v_payment_id;

    if v_first_payment_id is null then v_first_payment_id:=v_payment_id; end if;

    insert into public.pos_sale_tender(company_id,pos_sale_id,invoice_payment_id,payment_method,amount,amount_tendered,change_due,reference)
    values(v_company_id,v_pos_sale_id,v_payment_id,v_method,v_amount,v_tendered,v_change,v_tender_reference);
  end loop;

  update public.pos_sale set payment_id=v_first_payment_id where id=v_pos_sale_id;

  insert into public.pos_sale_item(company_id,pos_sale_id,invoice_item_id,inventory_item_id,description,quantity,catalogue_unit_price,invoice_unit_price,discount_mode,discount_value,line_total)
  select v_company_id,v_pos_sale_id,ii.id,ii.inventory_item_id,ii.description,ii.quantity,inv.selling_price,ii.unit_price,ii.discount_mode,ii.discount_value,ii.line_total
  from public.invoice_item ii join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id where ii.invoice_id=v_invoice_id;

  if p_suspended_sale_id is not null then
    update public.pos_suspended_sale set status='completed',completed_pos_sale_id=v_pos_sale_id,completed_at=now(),updated_at=now()
    where id=p_suspended_sale_id and company_id=v_company_id and status='suspended';
    if not found then raise exception 'Suspended sale completion could not be recorded.'; end if;
  end if;

  if v_approval_id is not null then
    update public.pos_approval_request set status='used',used_by=auth.uid(),used_at=now(),used_pos_sale_id=v_pos_sale_id,updated_at=now()
    where id=v_approval_id and company_id=v_company_id and status='approved';
    if not found then raise exception 'POS approval could not be consumed.'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method',payment_method,'amount',amount,'amount_tendered',amount_tendered,'change_due',change_due,'reference',reference
  ) order by created_at),'[]'::jsonb)
  into v_tender_breakdown
  from public.pos_sale_tender where pos_sale_id=v_pos_sale_id;

  return jsonb_build_object(
    'ok',true,'pos_sale_id',v_pos_sale_id,'sale_number',v_sale_number,'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,'payment_id',v_first_payment_id,'total',v_total,'amount_tendered',v_sum_tendered,
    'change_due',v_sum_change,'payment_method',v_sale_payment_method,'tenders',v_tender_breakdown,'profile_key',v_settings.profile_key,
    'suspended_sale_id',p_suspended_sale_id,'approval_id',v_approval_id,
    'message','POS sale completed. Split tenders, invoice payments, stock, Cost of Sales and Accounting were updated automatically.'
  );
end;
$function$;

grant execute on function public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid,jsonb) to authenticated;;
