create table if not exists public.pos_price_book (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null,
  description text null,
  branch_id uuid null references public.branch(id) on delete restrict,
  customer_type text null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  priority integer not null default 100,
  enabled boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_price_book_name_check check (length(trim(name)) >= 2),
  constraint pos_price_book_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint pos_price_book_priority_check check (priority between 0 and 10000),
  constraint pos_price_book_company_name_unique unique (company_id, name)
);

create table if not exists public.pos_price_book_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  price_book_id uuid not null references public.pos_price_book(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id) on delete restrict,
  minimum_quantity integer not null default 1,
  unit_price numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint pos_price_book_item_qty_check check (minimum_quantity >= 1),
  constraint pos_price_book_item_price_check check (unit_price > 0),
  constraint pos_price_book_item_unique unique (price_book_id, inventory_item_id, minimum_quantity)
);

create table if not exists public.pos_promotion (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null,
  description text null,
  branch_id uuid null references public.branch(id) on delete restrict,
  customer_type text null,
  inventory_item_id uuid null references public.inventory_item(id) on delete restrict,
  category_id uuid null references public.inventory_category(id) on delete restrict,
  promotion_type text not null,
  promotion_value numeric(14,4) not null,
  minimum_quantity integer not null default 1,
  starts_at timestamptz null,
  ends_at timestamptz null,
  priority integer not null default 100,
  enabled boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_promotion_name_check check (length(trim(name)) >= 2),
  constraint pos_promotion_type_check check (promotion_type in ('percentage','fixed_price')),
  constraint pos_promotion_value_check check (
    (promotion_type='percentage' and promotion_value > 0 and promotion_value < 100)
    or
    (promotion_type='fixed_price' and promotion_value > 0)
  ),
  constraint pos_promotion_qty_check check (minimum_quantity >= 1),
  constraint pos_promotion_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint pos_promotion_priority_check check (priority between 0 and 10000),
  constraint pos_promotion_target_check check (not (inventory_item_id is not null and category_id is not null)),
  constraint pos_promotion_company_name_unique unique (company_id, name)
);

create index if not exists pos_price_book_company_enabled_idx
  on public.pos_price_book(company_id, enabled, starts_at, ends_at, priority desc);

create index if not exists pos_price_book_item_lookup_idx
  on public.pos_price_book_item(company_id, inventory_item_id, minimum_quantity desc);

create index if not exists pos_promotion_lookup_idx
  on public.pos_promotion(company_id, enabled, inventory_item_id, category_id, starts_at, ends_at, priority desc);

alter table public.pos_price_book enable row level security;
alter table public.pos_price_book_item enable row level security;
alter table public.pos_promotion enable row level security;

revoke all on public.pos_price_book from anon, authenticated;
revoke all on public.pos_price_book_item from anon, authenticated;
revoke all on public.pos_promotion from anon, authenticated;

insert into public.permissions(permission_name)
values ('pos.pricing.view'), ('pos.pricing.manage')
on conflict (permission_name) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name='pos.pricing.view'
where r.role_name in ('owner','admin','manager')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name='pos.pricing.manage'
where r.role_name in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

create or replace function public.resolve_pos_pricing(
  p_company_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.inventory_item%rowtype;
  v_customer_type text;
  v_catalogue numeric(14,2);
  v_base numeric(14,2);
  v_final numeric(14,2);
  v_price_book_id uuid;
  v_price_book_name text;
  v_price_book_price numeric(14,2);
  v_promotion_id uuid;
  v_promotion_name text;
  v_promotion_type text;
  v_promotion_value numeric(14,4);
  v_promotion_price numeric(14,2);
  v_capabilities jsonb := '{}'::jsonb;
  v_price_books_enabled boolean := false;
  v_promotions_enabled boolean := false;
begin
  if p_company_id is null or p_branch_id is null or p_inventory_item_id is null then
    raise exception 'Company, branch and inventory item are required for POS pricing.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'POS pricing quantity must be greater than zero.';
  end if;

  select * into v_item
  from public.inventory_item
  where id=p_inventory_item_id
    and company_id=p_company_id
    and is_active=true;

  if not found then
    raise exception 'POS pricing item could not be found.';
  end if;

  if not exists(
    select 1 from public.branch
    where id=p_branch_id and company_id=p_company_id
  ) then
    raise exception 'POS pricing branch could not be found.';
  end if;

  if p_customer_id is not null then
    select customer_type into v_customer_type
    from public.customer
    where id=p_customer_id and company_id=p_company_id and is_active=true;
  end if;

  select coalesce(pt.capabilities,'{}'::jsonb) || coalesce(ps.capability_overrides,'{}'::jsonb)
  into v_capabilities
  from public.company_pos_settings ps
  join public.pos_profile_template pt
    on pt.profile_key=ps.profile_key and pt.is_active=true
  where ps.company_id=p_company_id;

  v_price_books_enabled := coalesce((v_capabilities->>'bulk_pricing')::boolean,false);
  v_promotions_enabled := coalesce((v_capabilities->>'promotions')::boolean,false);

  v_catalogue := round(v_item.selling_price,2);
  v_base := v_catalogue;
  v_final := v_catalogue;

  if v_price_books_enabled then
    select pb.id, pb.name, pbi.unit_price
    into v_price_book_id, v_price_book_name, v_price_book_price
    from public.pos_price_book pb
    join public.pos_price_book_item pbi
      on pbi.price_book_id=pb.id
     and pbi.company_id=pb.company_id
    where pb.company_id=p_company_id
      and pb.enabled=true
      and pbi.inventory_item_id=p_inventory_item_id
      and pbi.minimum_quantity <= floor(p_quantity)
      and (pb.branch_id is null or pb.branch_id=p_branch_id)
      and (pb.customer_type is null or pb.customer_type=v_customer_type)
      and (pb.starts_at is null or pb.starts_at<=p_at)
      and (pb.ends_at is null or pb.ends_at>p_at)
    order by
      pb.priority desc,
      (pb.branch_id is not null) desc,
      (pb.customer_type is not null) desc,
      pbi.minimum_quantity desc,
      pb.updated_at desc
    limit 1;

    if v_price_book_id is not null then
      v_base := round(v_price_book_price,2);
      v_final := v_base;
    end if;
  end if;

  if v_promotions_enabled then
    select q.id, q.name, q.promotion_type, q.promotion_value, q.final_price
    into v_promotion_id, v_promotion_name, v_promotion_type, v_promotion_value, v_promotion_price
    from (
      select
        pr.id,
        pr.name,
        pr.promotion_type,
        pr.promotion_value,
        case
          when pr.promotion_type='percentage'
            then round(v_base * (1 - pr.promotion_value/100),2)
          else round(pr.promotion_value,2)
        end as final_price,
        pr.priority,
        pr.updated_at
      from public.pos_promotion pr
      where pr.company_id=p_company_id
        and pr.enabled=true
        and pr.minimum_quantity <= floor(p_quantity)
        and (pr.branch_id is null or pr.branch_id=p_branch_id)
        and (pr.customer_type is null or pr.customer_type=v_customer_type)
        and (pr.inventory_item_id is null or pr.inventory_item_id=p_inventory_item_id)
        and (pr.category_id is null or pr.category_id=v_item.category_id)
        and (pr.starts_at is null or pr.starts_at<=p_at)
        and (pr.ends_at is null or pr.ends_at>p_at)
    ) q
    where q.final_price > 0
      and q.final_price < v_base
    order by q.final_price asc, q.priority desc, q.updated_at desc
    limit 1;

    if v_promotion_id is not null then
      v_final := v_promotion_price;
    end if;
  end if;

  return jsonb_build_object(
    'inventory_item_id',p_inventory_item_id,
    'quantity',p_quantity,
    'catalogue_unit_price',v_catalogue,
    'base_unit_price',v_base,
    'final_unit_price',v_final,
    'savings_per_unit',round(greatest(v_catalogue-v_final,0),2),
    'price_book_id',v_price_book_id,
    'price_book_name',v_price_book_name,
    'promotion_id',v_promotion_id,
    'promotion_name',v_promotion_name,
    'promotion_type',v_promotion_type,
    'promotion_value',v_promotion_value,
    'price_source',case
      when v_promotion_id is not null then 'promotion'
      when v_price_book_id is not null then 'price_book'
      else 'catalogue'
    end
  );
end;
$function$;

revoke all on function public.resolve_pos_pricing(uuid,uuid,uuid,uuid,numeric,timestamptz) from public, anon, authenticated;

create or replace function public.get_pos_pricing_workspace()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.pricing.view') then raise exception 'Permission denied: pos.pricing.view'; end if;

  v_company_id:=public.current_company_id();

  return jsonb_build_object(
    'ok',true,
    'can_manage',public.current_user_has_permission('pos.pricing.manage'),
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name)
      from public.branch b
      where b.company_id=v_company_id
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.category_name) order by c.category_name)
      from public.inventory_category c
      where c.company_id=v_company_id
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,
        'name',i.item_name,
        'sku',i.sku,
        'category_id',i.category_id,
        'selling_price',i.selling_price
      ) order by i.item_name)
      from public.inventory_item i
      where i.company_id=v_company_id and i.is_active=true
    ),'[]'::jsonb),
    'customer_types',coalesce((
      select jsonb_agg(x.customer_type order by x.customer_type)
      from (
        select distinct c.customer_type
        from public.customer c
        where c.company_id=v_company_id
          and c.is_active=true
          and c.customer_type is not null
      ) x
    ),'[]'::jsonb),
    'price_books',coalesce((
      select jsonb_agg(pb.obj order by pb.name)
      from (
        select
          b.name,
          jsonb_build_object(
            'id',b.id,
            'name',b.name,
            'description',b.description,
            'branch_id',b.branch_id,
            'branch_name',(select branch_name from public.branch where id=b.branch_id),
            'customer_type',b.customer_type,
            'starts_at',b.starts_at,
            'ends_at',b.ends_at,
            'priority',b.priority,
            'enabled',b.enabled,
            'updated_at',b.updated_at,
            'items',coalesce((
              select jsonb_agg(jsonb_build_object(
                'id',bi.id,
                'inventory_item_id',bi.inventory_item_id,
                'product_name',ii.item_name,
                'minimum_quantity',bi.minimum_quantity,
                'unit_price',bi.unit_price
              ) order by ii.item_name, bi.minimum_quantity)
              from public.pos_price_book_item bi
              join public.inventory_item ii on ii.id=bi.inventory_item_id
              where bi.price_book_id=b.id
            ),'[]'::jsonb)
          ) obj
        from public.pos_price_book b
        where b.company_id=v_company_id
      ) pb
    ),'[]'::jsonb),
    'promotions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'name',p.name,
        'description',p.description,
        'branch_id',p.branch_id,
        'branch_name',(select branch_name from public.branch where id=p.branch_id),
        'customer_type',p.customer_type,
        'inventory_item_id',p.inventory_item_id,
        'product_name',(select item_name from public.inventory_item where id=p.inventory_item_id),
        'category_id',p.category_id,
        'category_name',(select category_name from public.inventory_category where id=p.category_id),
        'promotion_type',p.promotion_type,
        'promotion_value',p.promotion_value,
        'minimum_quantity',p.minimum_quantity,
        'starts_at',p.starts_at,
        'ends_at',p.ends_at,
        'priority',p.priority,
        'enabled',p.enabled,
        'updated_at',p.updated_at
      ) order by p.name)
      from public.pos_promotion p
      where p.company_id=v_company_id
    ),'[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_pos_pricing_workspace() to authenticated;

create or replace function public.save_pos_price_book(
  p_price_book_id uuid,
  p_name text,
  p_description text,
  p_branch_id uuid,
  p_customer_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority integer,
  p_enabled boolean,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_item jsonb;
  v_inventory_id uuid;
  v_min_qty integer;
  v_unit_price numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.pricing.manage') then raise exception 'Permission denied: pos.pricing.manage'; end if;

  v_company_id:=public.current_company_id();

  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Price book name is required.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Price book end must be after start.'; end if;
  if p_priority is null or p_priority<0 or p_priority>10000 then raise exception 'Invalid price book priority.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one price book item.'; end if;

  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'Price book branch could not be found.';
  end if;

  if p_price_book_id is null then
    insert into public.pos_price_book(
      company_id,name,description,branch_id,customer_type,starts_at,ends_at,priority,enabled,created_by,updated_by
    ) values(
      v_company_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_branch_id,nullif(trim(coalesce(p_customer_type,'')),''),p_starts_at,p_ends_at,p_priority,coalesce(p_enabled,false),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.pos_price_book
    set name=trim(p_name),
        description=nullif(trim(coalesce(p_description,'')),''),
        branch_id=p_branch_id,
        customer_type=nullif(trim(coalesce(p_customer_type,'')),''),
        starts_at=p_starts_at,
        ends_at=p_ends_at,
        priority=p_priority,
        enabled=coalesce(p_enabled,false),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_price_book_id and company_id=v_company_id
    returning id into v_id;

    if v_id is null then raise exception 'Price book could not be found.'; end if;

    delete from public.pos_price_book_item where price_book_id=v_id and company_id=v_company_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_inventory_id:=(v_item->>'inventory_item_id')::uuid;
    v_min_qty:=coalesce(nullif(v_item->>'minimum_quantity','')::integer,1);
    v_unit_price:=round(coalesce(nullif(v_item->>'unit_price','')::numeric,0),2);

    if v_min_qty<1 then raise exception 'Minimum quantity must be at least 1.'; end if;
    if v_unit_price<=0 then raise exception 'Price book unit price must be greater than zero.'; end if;
    if not exists(select 1 from public.inventory_item where id=v_inventory_id and company_id=v_company_id and is_active=true) then
      raise exception 'One or more price book products could not be found.';
    end if;

    insert into public.pos_price_book_item(company_id,price_book_id,inventory_item_id,minimum_quantity,unit_price)
    values(v_company_id,v_id,v_inventory_id,v_min_qty,v_unit_price);
  end loop;

  return jsonb_build_object('ok',true,'price_book_id',v_id,'message','POS price book saved.');
end;
$function$;

grant execute on function public.save_pos_price_book(uuid,text,text,uuid,text,timestamptz,timestamptz,integer,boolean,jsonb) to authenticated;

create or replace function public.save_pos_promotion(
  p_promotion_id uuid,
  p_name text,
  p_description text,
  p_branch_id uuid,
  p_customer_type text,
  p_inventory_item_id uuid,
  p_category_id uuid,
  p_promotion_type text,
  p_promotion_value numeric,
  p_minimum_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority integer,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_type text:=lower(trim(coalesce(p_promotion_type,'')));
  v_value numeric(14,4):=round(coalesce(p_promotion_value,0),4);
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.pricing.manage') then raise exception 'Permission denied: pos.pricing.manage'; end if;

  v_company_id:=public.current_company_id();

  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Promotion name is required.'; end if;
  if v_type not in ('percentage','fixed_price') then raise exception 'Promotion type must be percentage or fixed price.'; end if;
  if v_type='percentage' and (v_value<=0 or v_value>=100) then raise exception 'Promotion percentage must be greater than 0 and less than 100.'; end if;
  if v_type='fixed_price' and v_value<=0 then raise exception 'Promotional fixed price must be greater than zero.'; end if;
  if coalesce(p_minimum_quantity,0)<1 then raise exception 'Promotion minimum quantity must be at least 1.'; end if;
  if p_inventory_item_id is not null and p_category_id is not null then raise exception 'Choose either a product or a category target, not both.'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Promotion end must be after start.'; end if;
  if p_priority is null or p_priority<0 or p_priority>10000 then raise exception 'Invalid promotion priority.'; end if;

  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'Promotion branch could not be found.';
  end if;
  if p_inventory_item_id is not null and not exists(select 1 from public.inventory_item where id=p_inventory_item_id and company_id=v_company_id and is_active=true) then
    raise exception 'Promotion product could not be found.';
  end if;
  if p_category_id is not null and not exists(select 1 from public.inventory_category where id=p_category_id and company_id=v_company_id) then
    raise exception 'Promotion category could not be found.';
  end if;

  if p_promotion_id is null then
    insert into public.pos_promotion(
      company_id,name,description,branch_id,customer_type,inventory_item_id,category_id,promotion_type,promotion_value,minimum_quantity,starts_at,ends_at,priority,enabled,created_by,updated_by
    ) values(
      v_company_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_branch_id,nullif(trim(coalesce(p_customer_type,'')),''),p_inventory_item_id,p_category_id,v_type,v_value,p_minimum_quantity,p_starts_at,p_ends_at,p_priority,coalesce(p_enabled,false),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.pos_promotion
    set name=trim(p_name),
        description=nullif(trim(coalesce(p_description,'')),''),
        branch_id=p_branch_id,
        customer_type=nullif(trim(coalesce(p_customer_type,'')),''),
        inventory_item_id=p_inventory_item_id,
        category_id=p_category_id,
        promotion_type=v_type,
        promotion_value=v_value,
        minimum_quantity=p_minimum_quantity,
        starts_at=p_starts_at,
        ends_at=p_ends_at,
        priority=p_priority,
        enabled=coalesce(p_enabled,false),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_promotion_id and company_id=v_company_id
    returning id into v_id;

    if v_id is null then raise exception 'Promotion could not be found.'; end if;
  end if;

  return jsonb_build_object('ok',true,'promotion_id',v_id,'message','POS promotion saved.');
end;
$function$;

grant execute on function public.save_pos_promotion(uuid,text,text,uuid,text,uuid,uuid,text,numeric,integer,timestamptz,timestamptz,integer,boolean) to authenticated;

create or replace function public.get_pos_cart_pricing(
  p_branch_id uuid,
  p_customer_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_item jsonb;
  v_result jsonb:='[]'::jsonb;
  v_inventory_id uuid;
  v_qty numeric;
  v_price jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;

  v_company_id:=public.current_company_id();

  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'Branch could not be found.';
  end if;

  if p_customer_id is not null and not exists(select 1 from public.customer where id=p_customer_id and company_id=v_company_id and is_active=true) then
    raise exception 'Customer could not be found.';
  end if;

  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Pricing items must be an array.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_inventory_id:=(v_item->>'inventory_item_id')::uuid;
    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,1);
    v_price:=public.resolve_pos_pricing(v_company_id,p_branch_id,p_customer_id,v_inventory_id,v_qty,now());
    v_result:=v_result || jsonb_build_array(v_price);
  end loop;

  return jsonb_build_object('ok',true,'items',v_result);
end;
$function$;

grant execute on function public.get_pos_cart_pricing(uuid,uuid,jsonb) to authenticated;;
