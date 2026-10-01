alter table public.pos_return drop constraint if exists pos_return_refund_method_check;
alter table public.pos_return add constraint pos_return_refund_method_check
check (refund_method = any (array['cash'::text,'card'::text,'eft'::text,'other'::text,'split'::text]));

create table if not exists public.pos_return_tender (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pos_return_id uuid not null references public.pos_return(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash','card','eft','other')),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(pos_return_id,payment_method)
);

alter table public.pos_return_tender enable row level security;
revoke all on public.pos_return_tender from anon, authenticated;

insert into public.pos_return_tender(company_id,pos_return_id,payment_method,amount)
select company_id,id,refund_method,refund_total
from public.pos_return
where status='completed'
  and refund_method in ('cash','card','eft','other')
  and refund_total>0
on conflict do nothing;

create or replace function public.process_pos_return(
  p_pos_sale_id uuid,
  p_items jsonb,
  p_reason text,
  p_return_type text default 'refund',
  p_refund_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_sale public.pos_sale%rowtype;
  v_invoice public.invoice%rowtype;
  v_profile public.accounting_posting_profile%rowtype;
  v_currency text:='ZAR';
  v_return_id uuid:=gen_random_uuid();
  v_return_number text;
  v_return_type text:=lower(trim(coalesce(p_return_type,'refund')));
  v_refund_method text;
  v_reason text:=trim(coalesce(p_reason,''));
  v_payment_account uuid;
  v_item jsonb;
  v_sale_item public.pos_sale_item%rowtype;
  v_invoice_item public.invoice_item%rowtype;
  v_qty numeric(14,3);
  v_prior_qty numeric(14,3);
  v_prior_refund numeric(14,2);
  v_prior_tax numeric(14,2);
  v_prior_cost numeric(18,2);
  v_remaining_qty numeric(14,3);
  v_fraction numeric;
  v_refund_amount numeric(14,2);
  v_tax_amount numeric(14,2);
  v_net_revenue numeric(14,2);
  v_cost_restored numeric(18,2);
  v_unit_cost numeric(18,6);
  v_return_item_id uuid;
  v_cost_movement_id uuid;
  v_cost_balance public.inventory_cost_balance%rowtype;
  v_total_refund numeric(14,2):=0;
  v_total_tax numeric(14,2):=0;
  v_total_net_revenue numeric(14,2):=0;
  v_total_cost numeric(18,2):=0;
  v_journal_lines jsonb:='[]'::jsonb;
  v_journal_id uuid;
  v_item_count integer:=0;
  v_tender record;
  v_available_total numeric(14,2):=0;
  v_remaining_refund numeric(14,2):=0;
  v_alloc numeric(14,2):=0;
  v_refund_tenders jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.return.process') then raise exception 'Permission denied: pos.return.process'; end if;

  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Company could not be resolved.'; end if;
  if v_reason='' or length(v_reason)<3 then raise exception 'A clear return reason is required.'; end if;
  if v_return_type not in ('refund','exchange') then raise exception 'Return type must be refund or exchange.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one item to return.'; end if;

  select * into v_sale from public.pos_sale
  where id=p_pos_sale_id and company_id=v_company_id for update;
  if not found then raise exception 'POS sale could not be found.'; end if;
  if v_sale.status<>'completed' then raise exception 'Only completed POS sales can be returned.'; end if;

  select * into v_invoice from public.invoice where id=v_sale.invoice_id and company_id=v_company_id;
  if not found then raise exception 'Original invoice could not be found.'; end if;

  v_refund_method:=lower(trim(coalesce(p_refund_method,v_sale.payment_method)));
  if v_refund_method not in ('cash','card','eft','other','split') then raise exception 'Refund method must be cash, card, EFT, other or original split tender.'; end if;

  if v_sale.payment_method<>'split' and v_refund_method='split' then
    raise exception 'Split refund is only valid for an original split-tender sale.';
  end if;

  if v_refund_method<>v_sale.payment_method and not public.current_user_has_permission('pos.return.manage') then
    raise exception 'Only Owner/Admin may refund to a different payment method.';
  end if;

  perform public.ensure_accounting_posting_profile(v_company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_company_id;
  select coalesce(base_currency,'ZAR') into v_currency from public.company_finance_settings where company_id=v_company_id;

  if v_profile.sales_revenue_account_id is null or v_profile.inventory_account_id is null or v_profile.cost_of_sales_account_id is null then
    raise exception 'POS return accounting accounts are not configured.';
  end if;

  if v_refund_method<>'split' then
    v_payment_account:=public.get_accounting_payment_account(v_company_id,v_refund_method);
  end if;

  v_return_number:=public.generate_pos_return_number(v_company_id);

  insert into public.pos_return(
    id,company_id,branch_id,return_number,original_pos_sale_id,customer_id,processed_by,
    return_type,refund_method,reason,status,refund_total,tax_total_reversed,cost_total_restored,metadata
  ) values (
    v_return_id,v_company_id,v_sale.branch_id,v_return_number,v_sale.id,v_sale.customer_id,auth.uid(),
    v_return_type,v_refund_method,v_reason,'completed',0,0,0,
    jsonb_build_object('original_sale_number',v_sale.sale_number,'original_payment_method',v_sale.payment_method)
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_count:=v_item_count+1;

    select * into v_sale_item from public.pos_sale_item
    where id=nullif(v_item->>'pos_sale_item_id','')::uuid
      and pos_sale_id=v_sale.id and company_id=v_company_id for update;
    if not found then raise exception 'One or more return items do not belong to the original POS sale.'; end if;

    select * into v_invoice_item from public.invoice_item
    where id=v_sale_item.invoice_item_id and company_id=v_company_id;
    if not found then raise exception 'Original invoice line could not be found.'; end if;

    v_qty:=round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty<=0 then raise exception 'Return quantity must be greater than zero.'; end if;
    if v_qty<>trunc(v_qty) then raise exception 'Current POS returns use whole-number quantities.'; end if;

    select coalesce(sum(pri.quantity),0),coalesce(sum(pri.refund_amount),0),coalesce(sum(pri.tax_amount_reversed),0),coalesce(sum(pri.cost_restored),0)
    into v_prior_qty,v_prior_refund,v_prior_tax,v_prior_cost
    from public.pos_return_item pri
    join public.pos_return pr on pr.id=pri.pos_return_id
    where pri.company_id=v_company_id
      and pri.original_pos_sale_item_id=v_sale_item.id
      and pr.status='completed';

    v_remaining_qty:=round(v_sale_item.quantity-v_prior_qty,3);
    if v_remaining_qty<=0 then raise exception '% has already been fully returned.',v_sale_item.description; end if;
    if v_qty>v_remaining_qty then raise exception 'Return quantity for % exceeds the remaining returnable quantity of %.',v_sale_item.description,v_remaining_qty; end if;

    if coalesce(v_invoice_item.total_cost_snapshot,0)<=0 or coalesce(v_invoice_item.unit_cost_snapshot,0)<=0 then
      raise exception 'Original cost snapshot is missing for %. This sale cannot be safely returned automatically.',v_sale_item.description;
    end if;

    v_fraction:=v_qty/v_sale_item.quantity;
    if v_qty=v_remaining_qty then
      v_refund_amount:=round(v_sale_item.line_total-v_prior_refund,2);
      v_tax_amount:=round(coalesce(v_invoice_item.line_tax,0)-v_prior_tax,2);
      v_cost_restored:=round(v_invoice_item.total_cost_snapshot-v_prior_cost,2);
    else
      v_refund_amount:=round(v_sale_item.line_total*v_fraction,2);
      v_tax_amount:=round(coalesce(v_invoice_item.line_tax,0)*v_fraction,2);
      v_cost_restored:=round(v_invoice_item.total_cost_snapshot*v_fraction,2);
    end if;

    v_net_revenue:=round(v_refund_amount-v_tax_amount,2);
    v_unit_cost:=round(v_cost_restored/v_qty,6);
    if v_refund_amount<=0 or v_cost_restored<=0 then raise exception 'Return value or cost is invalid for %.',v_sale_item.description; end if;

    insert into public.pos_return_item(
      company_id,pos_return_id,original_pos_sale_item_id,inventory_item_id,quantity,
      unit_refund_amount,refund_amount,tax_amount_reversed,unit_cost_snapshot,cost_restored
    ) values (
      v_company_id,v_return_id,v_sale_item.id,v_sale_item.inventory_item_id,v_qty,
      round(v_refund_amount/v_qty,6),v_refund_amount,v_tax_amount,v_unit_cost,v_cost_restored
    ) returning id into v_return_item_id;

    select * into v_cost_balance from public.inventory_cost_balance
    where company_id=v_company_id and branch_id=v_sale.branch_id and inventory_item_id=v_sale_item.inventory_item_id for update;
    if not found then raise exception 'Inventory cost balance could not be found for returned item %.',v_sale_item.description; end if;

    update public.inventory_cost_balance
    set quantity_on_hand=round(quantity_on_hand+v_qty,3),
        total_cost=round(total_cost+v_cost_restored,2),
        average_unit_cost=case when round(quantity_on_hand+v_qty,3)=0 then 0 else round((total_cost+v_cost_restored)/(quantity_on_hand+v_qty),6) end,
        last_movement_at=now(),updated_at=now()
    where id=v_cost_balance.id;

    update public.branch_stock
    set quantity=quantity+v_qty::integer,updated_at=now()
    where company_id=v_company_id and branch_id=v_sale.branch_id and inventory_item_id=v_sale_item.inventory_item_id;
    if not found then raise exception 'Branch stock could not be found for returned item %.',v_sale_item.description; end if;

    insert into public.stock_movement(company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes)
    values(v_company_id,v_sale.branch_id,v_sale_item.inventory_item_id,auth.uid(),'return',v_qty::integer,v_return_number,
      'POS return of '||v_sale_item.description||' from '||v_sale.sale_number);

    insert into public.inventory_cost_movement(
      company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
      source_type,source_id,source_line_id,reversal_of_movement_id,metadata,created_by
    ) values (
      v_company_id,v_sale.branch_id,v_sale_item.inventory_item_id,'sale_reversal',v_qty,v_unit_cost,v_cost_restored,current_date,
      'pos_return',v_return_id,v_return_item_id,v_invoice_item.cost_movement_id,
      jsonb_build_object('return_number',v_return_number,'original_sale_number',v_sale.sale_number,'reason',v_reason),auth.uid()
    ) returning id into v_cost_movement_id;

    update public.pos_return_item set inventory_cost_movement_id=v_cost_movement_id where id=v_return_item_id;

    v_total_refund:=round(v_total_refund+v_refund_amount,2);
    v_total_tax:=round(v_total_tax+v_tax_amount,2);
    v_total_net_revenue:=round(v_total_net_revenue+v_net_revenue,2);
    v_total_cost:=round(v_total_cost+v_cost_restored,2);
  end loop;

  if v_item_count<>jsonb_array_length(p_items) then raise exception 'Return item processing failed.'; end if;
  if v_total_refund<=0 then raise exception 'Return total must be greater than zero.'; end if;

  v_journal_lines:=v_journal_lines || jsonb_build_array(
    jsonb_build_object('account_id',v_profile.sales_revenue_account_id,'description','POS return · '||v_return_number||' · revenue reversal','debit',v_total_net_revenue,'credit',0,'customer_id',v_sale.customer_id,'metadata',jsonb_build_object('role','sales_return','original_sale',v_sale.sale_number))
  );

  if v_total_tax>0 then
    if v_profile.vat_output_account_id is null then raise exception 'VAT Output account is not configured.'; end if;
    v_journal_lines:=v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_id',v_profile.vat_output_account_id,'description','POS return · '||v_return_number||' · VAT reversal','debit',v_total_tax,'credit',0,'customer_id',v_sale.customer_id,'metadata',jsonb_build_object('role','vat_return'))
    );
  end if;

  if v_refund_method='split' then
    select coalesce(sum(greatest(pst.amount-coalesce(prior.refunded,0),0)),0)
    into v_available_total
    from public.pos_sale_tender pst
    left join lateral (
      select sum(prt.amount) as refunded
      from public.pos_return_tender prt
      join public.pos_return pr on pr.id=prt.pos_return_id
      where prt.company_id=pst.company_id
        and pr.original_pos_sale_id=v_sale.id
        and pr.status='completed'
        and prt.payment_method=pst.payment_method
    ) prior on true
    where pst.company_id=v_company_id and pst.pos_sale_id=v_sale.id;

    if v_available_total+0.009<v_total_refund then
      raise exception 'Original split tender does not have enough remaining refund capacity.';
    end if;

    v_remaining_refund:=v_total_refund;

    for v_tender in
      select payment_method,available_amount,rn,cnt
      from (
        select pst.payment_method,
               greatest(pst.amount-coalesce(prior.refunded,0),0) as available_amount,
               row_number() over(order by pst.created_at,pst.id) as rn,
               count(*) over() as cnt
        from public.pos_sale_tender pst
        left join lateral (
          select sum(prt.amount) as refunded
          from public.pos_return_tender prt
          join public.pos_return pr on pr.id=prt.pos_return_id
          where prt.company_id=pst.company_id
            and pr.original_pos_sale_id=v_sale.id
            and pr.status='completed'
            and prt.payment_method=pst.payment_method
        ) prior on true
        where pst.company_id=v_company_id and pst.pos_sale_id=v_sale.id
          and greatest(pst.amount-coalesce(prior.refunded,0),0)>0
      ) q
      order by rn
    loop
      if v_tender.rn=v_tender.cnt then
        v_alloc:=round(v_remaining_refund,2);
      else
        v_alloc:=round(least(v_remaining_refund,v_total_refund*(v_tender.available_amount/v_available_total)),2);
      end if;

      v_alloc:=least(v_alloc,round(v_tender.available_amount,2));
      if v_alloc<=0 then continue; end if;

      v_payment_account:=public.get_accounting_payment_account(v_company_id,v_tender.payment_method);
      v_journal_lines:=v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_id',v_payment_account,'description','POS split refund · '||v_return_number||' · '||upper(v_tender.payment_method),'debit',0,'credit',v_alloc,'customer_id',v_sale.customer_id,'metadata',jsonb_build_object('role','refund','payment_method',v_tender.payment_method))
      );

      insert into public.pos_return_tender(company_id,pos_return_id,payment_method,amount)
      values(v_company_id,v_return_id,v_tender.payment_method,v_alloc);

      v_refund_tenders:=v_refund_tenders || jsonb_build_array(jsonb_build_object('payment_method',v_tender.payment_method,'amount',v_alloc));
      v_remaining_refund:=round(v_remaining_refund-v_alloc,2);
    end loop;

    if abs(v_remaining_refund)>0.009 then raise exception 'Split refund allocation did not balance.'; end if;
  else
    v_journal_lines:=v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_id',v_payment_account,'description','POS refund · '||v_return_number,'debit',0,'credit',v_total_refund,'customer_id',v_sale.customer_id,'metadata',jsonb_build_object('role','refund','payment_method',v_refund_method))
    );

    insert into public.pos_return_tender(company_id,pos_return_id,payment_method,amount)
    values(v_company_id,v_return_id,v_refund_method,v_total_refund);
    v_refund_tenders:=jsonb_build_array(jsonb_build_object('payment_method',v_refund_method,'amount',v_total_refund));
  end if;

  v_journal_lines:=v_journal_lines || jsonb_build_array(
    jsonb_build_object('account_id',v_profile.inventory_account_id,'description','Inventory restored · '||v_return_number,'debit',v_total_cost,'credit',0,'metadata',jsonb_build_object('role','inventory_return')),
    jsonb_build_object('account_id',v_profile.cost_of_sales_account_id,'description','Cost of Sales reversed · '||v_return_number,'debit',0,'credit',v_total_cost,'metadata',jsonb_build_object('role','cogs_reversal'))
  );

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,v_sale.branch_id,current_date,'POS return/refund · '||v_return_number,v_return_number,
    'pos_return',v_return_id,'completed',v_currency,auth.uid(),v_journal_lines,null
  );

  update public.inventory_cost_movement set journal_entry_id=v_journal_id
  where company_id=v_company_id and source_type='pos_return' and source_id=v_return_id;

  update public.pos_return
  set refund_total=v_total_refund,tax_total_reversed=v_total_tax,cost_total_restored=v_total_cost,journal_entry_id=v_journal_id,
      metadata=metadata||jsonb_build_object('net_revenue_reversed',v_total_net_revenue,'item_count',v_item_count,'refund_tenders',v_refund_tenders)
  where id=v_return_id;

  return jsonb_build_object(
    'ok',true,'return_id',v_return_id,'return_number',v_return_number,'original_sale_number',v_sale.sale_number,
    'return_type',v_return_type,'refund_method',v_refund_method,'refund_tenders',v_refund_tenders,
    'refund_total',v_total_refund,'tax_reversed',v_total_tax,'cost_restored',v_total_cost,'journal_entry_id',v_journal_id,
    'message',case when v_return_type='exchange' then 'Return completed for exchange. Process the replacement item as a new POS sale and link it to this return.' else 'POS return and refund completed. Stock, Cost of Sales and Accounting were reversed automatically.' end
  );
end;
$function$;;
