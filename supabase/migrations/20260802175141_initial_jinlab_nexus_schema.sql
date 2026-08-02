-- JINLAB Nexus Initial Database Schema

create extension if not exists "pgcrypto";


-- Companies (Tenant)
create table company (
    id uuid primary key default gen_random_uuid(),
    company_name text not null,
    registration_number text,
    email text,
    phone text,
    address text,
    created_at timestamptz default now()
);


-- Company branches
create table branch (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references company(id) on delete cascade,
    branch_name text not null,
    address text,
    created_at timestamptz default now()
);


-- User profiles
create table user_profile (
    id uuid primary key default gen_random_uuid(),    user_id uuid not null,
    company_id uuid references company(id) on delete cascade,
    full_name text not null,
    email text,
    role text default 'employee',
    created_at timestamptz default now()
);


-- System roles
create table roles (
    id uuid primary key default gen_random_uuid(),
    role_name text unique not null,
    created_at timestamptz default now()
);


-- System permissions
create table permissions (
    id uuid primary key default gen_random_uuid(),
    permission_name text unique not null,
    created_at timestamptz default now()
);
