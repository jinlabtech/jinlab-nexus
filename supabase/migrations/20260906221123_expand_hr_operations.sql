create table if not exists public.hr_shift_template (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null check (btrim(name)<>''),
  code text not null check (btrim(code)<>''),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 1440),
  late_grace_minutes integer not null default 5 check (late_grace_minutes between 0 and 240),
  overtime_threshold_minutes integer not null default 30 check (overtime_threshold_minutes between 0 and 480),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);

create table if not exists public.hr_roster_assignment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  branch_id uuid references public.branch(id) on delete set null,
  shift_template_id uuid not null references public.hr_shift_template(id) on delete restrict,
  shift_date date not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,employee_id,shift_date)
);

create table if not exists public.hr_attendance_exception (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  roster_assignment_id uuid references public.hr_roster_assignment(id) on delete set null,
  time_entry_id uuid references public.hr_time_entry(id) on delete set null,
  branch_id uuid references public.branch(id) on delete set null,
  exception_date date not null,
  exception_type text not null check (exception_type in ('absence','late','early_departure','missing_clock_out','overtime','manual')),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  exception_key text not null,
  minutes_variance integer,
  details text,
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,exception_key)
);

create table if not exists public.hr_leave_balance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_type(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  opening_units numeric(12,2) not null default 0,
  accrued_units numeric(12,2) not null default 0,
  adjustment_units numeric(12,2) not null default 0,
  notes text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>=period_start),
  unique(company_id,employee_id,leave_type_id,period_start,period_end)
);

create table if not exists public.hr_performance_review (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  reviewer_user_id uuid,
  period_start date not null,
  period_end date not null,
  rating numeric(3,2) check (rating is null or (rating>=1 and rating<=5)),
  status text not null default 'draft' check (status in ('draft','submitted','acknowledged','closed')),
  summary text,
  strengths text,
  improvement_areas text,
  goals text,
  employee_comments text,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>=period_start)
);

create table if not exists public.hr_disciplinary_case (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  case_type text not null check (case_type in ('counselling','verbal_warning','written_warning','final_written_warning','investigation','misconduct','other')),
  incident_date date not null,
  status text not null default 'open' check (status in ('open','issued','appealed','closed','withdrawn')),
  summary text not null check (btrim(summary)<>''),
  details text,
  action_taken text,
  issued_by uuid,
  issued_at timestamptz,
  expiry_date date,
  employee_comments text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_document_record (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  document_type text not null check (document_type in ('contract','id_document','certificate','medical_note','warning','performance','policy_acknowledgement','other')),
  title text not null check (btrim(title)<>''),
  file_path text,
  issued_date date,
  expiry_date date,
  status text not null default 'current' check (status in ('current','expired','archived')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expiry_date is null or issued_date is null or expiry_date>=issued_date)
);

create index if not exists hr_roster_company_date_idx on public.hr_roster_assignment(company_id,shift_date);
create index if not exists hr_roster_employee_idx on public.hr_roster_assignment(employee_id,shift_date);
create index if not exists hr_attendance_exception_company_status_idx on public.hr_attendance_exception(company_id,status,exception_date desc);
create index if not exists hr_leave_balance_employee_idx on public.hr_leave_balance(employee_id,period_start,period_end);
create index if not exists hr_performance_employee_idx on public.hr_performance_review(employee_id,period_end desc);
create index if not exists hr_discipline_employee_idx on public.hr_disciplinary_case(employee_id,incident_date desc);
create index if not exists hr_document_employee_idx on public.hr_document_record(employee_id,created_at desc);

alter table public.hr_shift_template enable row level security;
alter table public.hr_roster_assignment enable row level security;
alter table public.hr_attendance_exception enable row level security;
alter table public.hr_leave_balance enable row level security;
alter table public.hr_performance_review enable row level security;
alter table public.hr_disciplinary_case enable row level security;
alter table public.hr_document_record enable row level security;

revoke all on public.hr_shift_template, public.hr_roster_assignment, public.hr_attendance_exception, public.hr_leave_balance, public.hr_performance_review, public.hr_disciplinary_case, public.hr_document_record from public, anon, authenticated;

insert into public.permissions(permission_name) values
 ('hr.schedule.view'),('hr.schedule.manage'),('hr.attendance.review'),('hr.leave.manage'),('hr.performance.manage'),('hr.discipline.manage'),('hr.documents.manage')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on true
where (p.permission_name='hr.schedule.view' and r.role_name in ('owner','admin','manager','employee','technician','cashier'))
   or (p.permission_name='hr.schedule.manage' and r.role_name in ('owner','admin','manager'))
   or (p.permission_name='hr.attendance.review' and r.role_name in ('owner','admin','manager'))
   or (p.permission_name='hr.leave.manage' and r.role_name in ('owner','admin'))
   or (p.permission_name='hr.performance.manage' and r.role_name in ('owner','admin','manager'))
   or (p.permission_name='hr.discipline.manage' and r.role_name in ('owner','admin'))
   or (p.permission_name='hr.documents.manage' and r.role_name in ('owner','admin'))
on conflict do nothing;;
