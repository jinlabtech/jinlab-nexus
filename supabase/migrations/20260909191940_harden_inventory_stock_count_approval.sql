insert into public.permissions(permission_name)
values ('inventory.stock.count.apply')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='inventory.stock.count.apply'
where r.role_name in ('owner','admin')
on conflict(role_id,permission_id) do nothing;

do $$
declare
  v_def text;
  v_old text := 'current_user_has_permission(''inventory.update'')';
  v_new text := 'current_user_has_permission(''inventory.stock.count.apply'')';
begin
  select pg_get_functiondef('public.apply_inventory_stock_count(uuid,text)'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Expected inventory.update guard not found in apply_inventory_stock_count';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $$;;
