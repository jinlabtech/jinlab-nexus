-- ISOLATED LOCAL DATABASE ONLY. Minimal copies of observed production interfaces.
-- Run against a disposable database before the migration and secondhand-db.sql.
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
create table public.company(id uuid primary key default gen_random_uuid(),company_name text);
create table public.branch(id uuid primary key default gen_random_uuid(),company_id uuid references public.company,branch_name text);
create table public.inventory_item(id uuid primary key default gen_random_uuid(),company_id uuid not null,item_name text not null,sku text not null,description text,cost_price numeric not null,selling_price numeric not null,minimum_stock integer default 0,is_active boolean default true);
create table public.branch_stock(id uuid primary key default gen_random_uuid(),company_id uuid,branch_id uuid,inventory_item_id uuid,quantity integer default 0);
create table public.service_job(id uuid primary key default gen_random_uuid(),company_id uuid,branch_id uuid,serial_number text,imei text,status text);
create table public.stock_movement(id uuid primary key default gen_random_uuid(),company_id uuid,branch_id uuid,inventory_item_id uuid,quantity integer);
create table public.pos_sale_item(id uuid primary key default gen_random_uuid(),inventory_item_id uuid);
create table public.invoice_item(id uuid primary key default gen_random_uuid(),inventory_item_id uuid);
create table public.sales_order_item(id uuid primary key default gen_random_uuid(),inventory_item_id uuid);
create table public.inventory_stock_transfer_item(id uuid primary key default gen_random_uuid(),inventory_item_id uuid);
create table public.service_job_line(id uuid primary key default gen_random_uuid(),inventory_item_id uuid,service_job_id uuid);
create table public.permissions(id uuid primary key default gen_random_uuid(),permission_name text unique);
create table public.user_profile(user_id uuid,company_id uuid,role text);
-- Reproduce permissive legacy tables to prove new register ignores them.
grant all on all tables in schema public to anon,authenticated;
