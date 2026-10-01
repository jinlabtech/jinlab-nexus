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
    coalesce(sum(ps.total_amount),0),
    count(*)
  into v_total,v_count
  from public.pos_sale ps
  where ps.company_id=v_company_id
    and ps.till_session_id=p_session_id
    and ps.status='completed';

  select
    coalesce(sum(pst.amount) filter(where pst.payment_method='cash'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='card'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='eft'),0),
    coalesce(sum(pst.amount) filter(where pst.payment_method='other'),0)
  into v_cash,v_card,v_eft,v_other
  from public.pos_sale_tender pst
  join public.pos_sale ps on ps.id=pst.pos_sale_id and ps.company_id=pst.company_id
  where pst.company_id=v_company_id
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
$function$;;
