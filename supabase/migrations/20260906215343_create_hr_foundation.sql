-- JINLAB Nexus HR Foundation

insert into public.permissions(permission_name)
values
  ('hr.view'),
  ('hr.employee.manage'),
  ('hr.attendance.manage'),
  ('hr.leave.approve'),
  ('hr.self')
on conflict (permission_name) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name in ('hr.view','hr.employee.manage','hr.attendance.manage','hr.leave.approve','hr.self')
where r.role_name in ('owner','admin')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name in ('hr.view','hr.attendance.manage','hr.leave.approve','hr.self')
where r.role_name='manager'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name='hr.self'
where r.role_name in ('employee','cashier','technician')
on conflict do nothing;

create table if not exists public.hr_department (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (btrim(code) <> '')
);

create unique index if not exists hr_department_company_code_uq
  on public.hr_department(company_id, lower(code));
create unique index if not exists hr_department_company_name_uq
  on public.hr_department(company_id, lower(name));

create table if not exists public.hr_position (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  department_id uuid references public.hr_department(id) on delete set null,
  title text not null,
  code text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(title) <> ''),
  check (btrim(code) <> '')
);

create unique index if not exists hr_position_company_code_uq
  on public.hr_position(company_id, lower(code));
create index if not exists hr_position_department_idx
  on public.hr_position(company_id, department_id);

create table if not exists public.hr_employee_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  email text,
  phone text,
  primary_branch_id uuid references public.branch(id) on delete set null,
  department_id uuid references public.hr_department(id) on delete set null,
  position_id uuid references public.hr_position(id) on delete set null,
  manager_employee_id uuid references public.hr_employee(id) on delete set null,
  employment_type text not null default 'permanent',
  status text not null default 'active',
  hire_date date not null default current_date,
  end_date date,
  standard_hours_per_week numeric(6,2) not null default 45 check (standard_hours_per_week >= 0 and standard_hours_per_week <= 168),
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(employee_number) <> ''),
  check (btrim(first_name) <> ''),
  check (btrim(last_name) <> ''),
  check (employment_type in ('permanent','fixed_term','part_time','casual','contractor','intern')),
  check (status in ('active','on_leave','suspended','terminated')),
  check (end_date is null or end_date >= hire_date)
);

create unique index if not exists hr_employee_company_number_uq
  on public.hr_employee(company_id, lower(employee_number));
create unique index if not exists hr_employee_company_user_uq
  on public.hr_employee(company_id, user_id) where user_id is not null;
create index if not exists hr_employee_company_status_idx
  on public.hr_employee(company_id, status);
create index if not exists hr_employee_branch_idx
  on public.hr_employee(company_id, primary_branch_id);
create index if not exists hr_employee_manager_idx
  on public.hr_employee(company_id, manager_employee_id);

create table if not exists public.hr_time_entry (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  branch_id uuid references public.branch(id) on delete set null,
  work_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  status text not null default 'open',
  source text not null default 'web',
  notes text,
  approved_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('open','completed','adjusted')),
  check (source in ('web','mobile','kiosk','biometric','import','manual')),
  check (clock_out_at is null or clock_out_at >= clock_in_at)
);

create unique index if not exists hr_time_entry_one_open_uq
  on public.hr_time_entry(company_id, employee_id) where status='open';
create index if not exists hr_time_entry_company_date_idx
  on public.hr_time_entry(company_id, work_date desc);
create index if not exists hr_time_entry_employee_date_idx
  on public.hr_time_entry(company_id, employee_id, work_date desc);

create table if not exists public.hr_attendance_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  time_entry_id uuid references public.hr_time_entry(id) on delete set null,
  branch_id uuid references public.branch(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'web',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check (event_type in ('clock_in','clock_out')),
  check (source in ('web','mobile','kiosk','biometric','import','manual'))
);

create index if not exists hr_attendance_event_company_time_idx
  on public.hr_attendance_event(company_id, occurred_at desc);
create index if not exists hr_attendance_event_employee_idx
  on public.hr_attendance_event(company_id, employee_id, occurred_at desc);

create table if not exists public.hr_leave_type (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  code text not null,
  name text not null,
  is_paid boolean not null default true,
  requires_attachment boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(code) <> ''),
  check (btrim(name) <> '')
);

create unique index if not exists hr_leave_type_company_code_uq
  on public.hr_leave_type(company_id, lower(code));

create table if not exists public.hr_leave_request (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_type(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  calendar_days integer not null check (calendar_days > 0),
  reason text,
  status text not null default 'pending',
  requested_by uuid,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (status in ('pending','approved','rejected','cancelled'))
);

create index if not exists hr_leave_request_company_status_idx
  on public.hr_leave_request(company_id, status, start_date);
create index if not exists hr_leave_request_employee_idx
  on public.hr_leave_request(company_id, employee_id, start_date desc);

-- HR data is sensitive. Direct table access is disabled; frontend uses audited RPCs.
alter table public.hr_department enable row level security;
alter table public.hr_position enable row level security;
alter table public.hr_employee_sequence enable row level security;
alter table public.hr_employee enable row level security;
alter table public.hr_time_entry enable row level security;
alter table public.hr_attendance_event enable row level security;
alter table public.hr_leave_type enable row level security;
alter table public.hr_leave_request enable row level security;

revoke all on public.hr_department, public.hr_position, public.hr_employee_sequence,
  public.hr_employee, public.hr_time_entry, public.hr_attendance_event,
  public.hr_leave_type, public.hr_leave_request
from public, anon, authenticated;

-- updated_at maintenance
create trigger hr_department_set_updated_at before update on public.hr_department
for each row execute function public.set_updated_at();
create trigger hr_position_set_updated_at before update on public.hr_position
for each row execute function public.set_updated_at();
create trigger hr_employee_set_updated_at before update on public.hr_employee
for each row execute function public.set_updated_at();
create trigger hr_time_entry_set_updated_at before update on public.hr_time_entry
for each row execute function public.set_updated_at();
create trigger hr_leave_type_set_updated_at before update on public.hr_leave_type
for each row execute function public.set_updated_at();
create trigger hr_leave_request_set_updated_at before update on public.hr_leave_request
for each row execute function public.set_updated_at();;
