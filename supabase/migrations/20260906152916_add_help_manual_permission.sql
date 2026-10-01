insert into public.permissions (permission_name)
select 'help.view'
where not exists (
  select 1
  from public.permissions
  where permission_name = 'help.view'
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_name = 'help.view'
where r.role_name in ('owner','admin','manager','employee')
and not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);;
