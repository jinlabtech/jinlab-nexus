do $do$
declare
  v_def text;
  v_old text := $q$coalesce(sum(case when a.system_key='payment_clearing' then jl.debit-jl.credit else 0 end),0),$q$;
  v_new text := $q$coalesce(sum(case when a.system_key='payment_clearing' and je.entry_date<=current_date then jl.debit-jl.credit else 0 end),0),$q$;
begin
  select pg_get_functiondef('public.get_accounting_pos_readiness_audit_legacy_pre_costing_cutover()'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Payment clearing expression was not found in legacy POS readiness audit.';
  end if;

  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end;
$do$;;
