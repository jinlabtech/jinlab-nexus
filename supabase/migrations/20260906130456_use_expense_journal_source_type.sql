do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.record_accounting_expense(date,uuid,numeric,text,text,uuid,uuid,text,text,text,date,numeric)'::regprocedure
  ) into v_def;
  v_def:=replace(v_def,'''accounting_expense''','''expense''');
  execute v_def;

  select pg_get_functiondef(
    'public.pay_accounting_expense(uuid,text,date,text)'::regprocedure
  ) into v_def;
  v_def:=replace(v_def,'''accounting_expense''','''expense''');
  execute v_def;
end;
$$;;
