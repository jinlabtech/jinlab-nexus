-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1D
-- Financial Year Scheduler
-- ============================================================


-- ============================================================
-- 1. FINANCIAL YEARS
-- ============================================================

create table if not exists
public.accounting_financial_year (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  name text not null,

  start_date date not null,

  end_date date not null,

  status text not null
    default 'scheduled'
    check (
      status in (
        'scheduled',
        'open',
        'closed',
        'locked'
      )
    ),

  schedule_source text not null
    default 'settings'
    check (
      schedule_source in (
        'settings',
        'manual'
      )
    ),

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  check (
    end_date >= start_date
  ),

  unique (
    company_id,
    start_date,
    end_date
  )
);


create index if not exists
accounting_financial_year_company_idx
on public.accounting_financial_year (
  company_id
);


create index if not exists
accounting_financial_year_dates_idx
on public.accounting_financial_year (
  company_id,
  start_date,
  end_date
);


create index if not exists
accounting_financial_year_status_idx
on public.accounting_financial_year (
  company_id,
  status
);


drop trigger if exists
accounting_financial_year_set_updated_at
on public.accounting_financial_year;

create trigger
accounting_financial_year_set_updated_at
before update
on public.accounting_financial_year
for each row
execute function public.set_updated_at();


-- ============================================================
-- 2. LINK ACCOUNTING PERIODS TO FINANCIAL YEARS
-- ============================================================

alter table public.accounting_period
add column if not exists
financial_year_id uuid
references public.accounting_financial_year(id)
on delete restrict;


create index if not exists
accounting_period_financial_year_idx
on public.accounting_period (
  financial_year_id
);


-- ============================================================
-- 3. RESOLVE / CREATE FINANCIAL YEAR
-- Existing manually scheduled years take precedence.
-- ============================================================

create or replace function
public.ensure_accounting_financial_year(
  p_company_id uuid,
  p_reference_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial_year_id uuid;

  v_start_month integer;
  v_start_year integer;

  v_start_date date;
  v_end_date date;

  v_name text;
begin

  if p_company_id is null then
    raise exception
      'Company is required.';
  end if;

  if p_reference_date is null then
    raise exception
      'Reference date is required.';
  end if;


  -- ----------------------------------------------------------
  -- Respect an already scheduled financial year first.
  -- ----------------------------------------------------------

  select id
  into v_financial_year_id
  from public.accounting_financial_year
  where company_id =
    p_company_id
    and p_reference_date
      between start_date
      and end_date
  order by start_date desc
  limit 1;

  if found then

    update public.accounting_financial_year
    set status = 'open'
    where id =
      v_financial_year_id
      and status = 'scheduled'
      and current_date
        between start_date
        and end_date;

    return
      v_financial_year_id;

  end if;


  -- ----------------------------------------------------------
  -- Otherwise derive the year from Finance Settings.
  -- ----------------------------------------------------------

  select financial_year_start_month
  into v_start_month
  from public.company_finance_settings
  where company_id =
    p_company_id;

  v_start_month :=
    coalesce(
      v_start_month,
      3
    );

  v_start_year :=
    extract(
      year from p_reference_date
    )::integer;

  if extract(
       month from p_reference_date
     )::integer <
     v_start_month then

    v_start_year :=
      v_start_year - 1;

  end if;


  v_start_date :=
    make_date(
      v_start_year,
      v_start_month,
      1
    );

  v_end_date :=
    (
      v_start_date +
      interval '1 year' -
      interval '1 day'
    )::date;


  v_name :=
    case
      when extract(
        year from v_start_date
      )::integer =
      extract(
        year from v_end_date
      )::integer
      then
        'FY ' ||
        extract(
          year from v_start_date
        )::integer::text

      else
        'FY ' ||
        extract(
          year from v_start_date
        )::integer::text ||
        '/' ||
        extract(
          year from v_end_date
        )::integer::text
    end;


  insert into
  public.accounting_financial_year (
    company_id,
    name,
    start_date,
    end_date,
    status,
    schedule_source
  )
  values (
    p_company_id,
    v_name,
    v_start_date,
    v_end_date,

    case
      when current_date
        between v_start_date
        and v_end_date
      then 'open'
      else 'scheduled'
    end,

    'settings'
  )
  on conflict (
    company_id,
    start_date,
    end_date
  )
  do update set
    name =
      excluded.name
  returning id
  into v_financial_year_id;


  return
    v_financial_year_id;

end;
$$;


revoke all
on function
public.ensure_accounting_financial_year(
  uuid,
  date
)
from public;


-- ============================================================
-- 4. GENERATE PERIODS INSIDE A FINANCIAL YEAR
--
-- Supports normal 12-month years AND transition years.
-- Periods follow the financial-year start day.
-- ============================================================

create or replace function
public.generate_accounting_periods_for_financial_year(
  p_financial_year_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.accounting_financial_year%rowtype;

  v_period_start date;
  v_period_end date;

  v_period_number integer := 1;

  v_period_name text;
begin

  select *
  into v_year
  from public.accounting_financial_year
  where id =
    p_financial_year_id;

  if not found then
    raise exception
      'Financial year could not be found.';
  end if;


  v_period_start :=
    v_year.start_date;


  while
    v_period_start <=
    v_year.end_date
  loop

    v_period_end :=
      least(
        (
          v_period_start +
          interval '1 month' -
          interval '1 day'
        )::date,

        v_year.end_date
      );


    v_period_name :=
      'P' ||
      lpad(
        v_period_number::text,
        2,
        '0'
      ) ||
      ' · ' ||
      to_char(
        v_period_start,
        'Mon YYYY'
      );


    insert into
    public.accounting_period (
      company_id,
      financial_year_id,
      name,
      start_date,
      end_date,
      status
    )
    values (
      v_year.company_id,
      v_year.id,
      v_period_name,
      v_period_start,
      v_period_end,

      case
        when v_year.status =
          'scheduled'
        then 'open'

        when v_year.status =
          'locked'
        then 'locked'

        when v_year.status =
          'closed'
        then 'closed'

        else 'open'
      end
    )

    on conflict (
      company_id,
      start_date,
      end_date
    )
    do update set
      financial_year_id =
        coalesce(
          accounting_period
            .financial_year_id,
          excluded
            .financial_year_id
        );


    v_period_start :=
      v_period_end + 1;

    v_period_number :=
      v_period_number + 1;

  end loop;

end;
$$;


revoke all
on function
public.generate_accounting_periods_for_financial_year(
  uuid
)
from public;


-- ============================================================
-- 5. REPLACE OLD PERIOD GENERATOR
-- It now routes through Financial Years.
-- ============================================================

create or replace function
public.ensure_accounting_periods(
  p_company_id uuid,
  p_reference_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial_year_id uuid;
begin

  v_financial_year_id :=
    public.ensure_accounting_financial_year(
      p_company_id,
      p_reference_date
    );


  perform
    public.generate_accounting_periods_for_financial_year(
      v_financial_year_id
    );

end;
$$;


revoke all
on function
public.ensure_accounting_periods(
  uuid,
  date
)
from public;


-- ============================================================
-- 6. MIGRATE EXISTING COMPANIES
-- ============================================================

do $$
declare
  v_company record;

  v_financial_year_id uuid;
begin

  for v_company in
    select id
    from public.company
  loop

    v_financial_year_id :=
      public.ensure_accounting_financial_year(
        v_company.id,
        current_date
      );


    perform
      public.generate_accounting_periods_for_financial_year(
        v_financial_year_id
      );

  end loop;

end;
$$;


-- Link any old matching accounting periods.
update public.accounting_period ap
set financial_year_id =
  fy.id
from public.accounting_financial_year fy
where
  ap.company_id =
    fy.company_id

  and ap.financial_year_id
    is null

  and ap.start_date >=
    fy.start_date

  and ap.end_date <=
    fy.end_date;


-- ============================================================
-- 7. SCHEDULE A FUTURE FINANCIAL YEAR
-- ============================================================

create or replace function
public.schedule_accounting_financial_year(
  p_start_date date,
  p_end_date date,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_year public.accounting_financial_year%rowtype;

  v_name text;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.financial_year.manage'
  ) then
    raise exception
      'Permission denied: accounting.financial_year.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  if p_start_date is null
     or p_end_date is null then
    raise exception
      'Start date and end date are required.';
  end if;


  if p_end_date <
     p_start_date then
    raise exception
      'Financial year end date cannot be before the start date.';
  end if;


  if p_start_date <=
     current_date then
    raise exception
      'New financial-year schedules must start in the future.';
  end if;


  if exists (
    select 1
    from public.accounting_financial_year
    where company_id =
      v_company_id

      and daterange(
        start_date,
        end_date,
        '[]'
      )
      &&
      daterange(
        p_start_date,
        p_end_date,
        '[]'
      )
  ) then

    raise exception
      'This financial year overlaps an existing financial year.';

  end if;


  v_name :=
    coalesce(
      nullif(
        trim(p_name),
        ''
      ),

      'FY ' ||
      extract(
        year from p_start_date
      )::integer::text ||
      '/' ||
      extract(
        year from p_end_date
      )::integer::text
    );


  insert into
  public.accounting_financial_year (
    company_id,
    name,
    start_date,
    end_date,
    status,
    schedule_source,
    created_by,
    updated_by
  )
  values (
    v_company_id,
    v_name,
    p_start_date,
    p_end_date,
    'scheduled',
    'manual',
    auth.uid(),
    auth.uid()
  )
  returning *
  into v_year;


  perform
    public.generate_accounting_periods_for_financial_year(
      v_year.id
    );


  return jsonb_build_object(
    'ok',
      true,

    'financial_year',
      jsonb_build_object(
        'id',
          v_year.id,
        'name',
          v_year.name,
        'start_date',
          v_year.start_date,
        'end_date',
          v_year.end_date,
        'status',
          v_year.status
      )
  );

end;
$$;


revoke all
on function
public.schedule_accounting_financial_year(
  date,
  date,
  text
)
from public;

grant execute
on function
public.schedule_accounting_financial_year(
  date,
  date,
  text
)
to authenticated;


-- ============================================================
-- 8. CHANGE A FUTURE SCHEDULE
-- Historical accounting cannot be rewritten.
-- ============================================================

create or replace function
public.update_scheduled_accounting_financial_year(
  p_financial_year_id uuid,
  p_start_date date,
  p_end_date date,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_year public.accounting_financial_year%rowtype;

  v_name text;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.financial_year.manage'
  ) then
    raise exception
      'Permission denied: accounting.financial_year.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  select *
  into v_year
  from public.accounting_financial_year
  where id =
    p_financial_year_id

    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Financial year could not be found.';
  end if;


  if v_year.status <>
     'scheduled' then
    raise exception
      'Only scheduled future financial years can be changed.';
  end if;


  if v_year.start_date <=
     current_date then
    raise exception
      'An active or historical financial year cannot be rescheduled.';
  end if;


  if p_start_date <=
     current_date then
    raise exception
      'The new financial year must begin in the future.';
  end if;


  if p_end_date <
     p_start_date then
    raise exception
      'Financial year end date cannot be before the start date.';
  end if;


  -- No ledger activity may exist inside its periods.
  if exists (
    select 1
    from public.journal_entry je

    join public.accounting_period ap
      on ap.id =
        je.accounting_period_id

    where
      ap.financial_year_id =
        v_year.id
  ) then

    raise exception
      'This financial year already contains ledger activity and cannot be rescheduled.';

  end if;


  if exists (
    select 1
    from public.accounting_financial_year fy

    where
      fy.company_id =
        v_company_id

      and fy.id <>
        v_year.id

      and daterange(
        fy.start_date,
        fy.end_date,
        '[]'
      )
      &&
      daterange(
        p_start_date,
        p_end_date,
        '[]'
      )
  ) then

    raise exception
      'The new schedule overlaps another financial year.';

  end if;


  delete from public.accounting_period
  where financial_year_id =
    v_year.id;


  v_name :=
    coalesce(
      nullif(
        trim(p_name),
        ''
      ),

      'FY ' ||
      extract(
        year from p_start_date
      )::integer::text ||
      '/' ||
      extract(
        year from p_end_date
      )::integer::text
    );


  update public.accounting_financial_year
  set
    name =
      v_name,

    start_date =
      p_start_date,

    end_date =
      p_end_date,

    schedule_source =
      'manual',

    updated_by =
      auth.uid()

  where id =
    v_year.id

  returning *
  into v_year;


  perform
    public.generate_accounting_periods_for_financial_year(
      v_year.id
    );


  return jsonb_build_object(
    'ok',
      true,

    'financial_year',
      jsonb_build_object(
        'id',
          v_year.id,
        'name',
          v_year.name,
        'start_date',
          v_year.start_date,
        'end_date',
          v_year.end_date,
        'status',
          v_year.status
      )
  );

end;
$$;


revoke all
on function
public.update_scheduled_accounting_financial_year(
  uuid,
  date,
  date,
  text
)
from public;

grant execute
on function
public.update_scheduled_accounting_financial_year(
  uuid,
  date,
  date,
  text
)
to authenticated;


-- ============================================================
-- 9. SECURITY
-- ============================================================

alter table
public.accounting_financial_year
enable row level security;


create policy
"company members read financial years"
on public.accounting_financial_year
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id =
      auth.uid()
  )
);


revoke insert, update, delete
on public.accounting_financial_year
from authenticated;


grant select
on public.accounting_financial_year
to authenticated;


-- ============================================================
-- 10. RBAC
-- ============================================================

insert into public.permissions (
  permission_name
)
values (
  'accounting.financial_year.manage'
)
on conflict (
  permission_name
)
do nothing;


insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name =
    'accounting.financial_year.manage'
where r.role_name in (
  'owner',
  'admin'
)
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- END
-- ============================================================
