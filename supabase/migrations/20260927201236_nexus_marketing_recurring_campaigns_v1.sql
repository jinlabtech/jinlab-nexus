-- =========================================================
-- JINLAB Nexus
-- Recurring Email Marketing Campaigns v1
-- =========================================================

-- A recurring series stores the reusable campaign definition
-- and recurrence rules.
create table if not exists public.marketing_campaign_series (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id) on delete cascade,

  branch_id uuid,

  name text not null
    check (char_length(btrim(name)) between 1 and 160),

  description text,

  email_account_id uuid not null,
  template_id uuid not null,
  template_version_id uuid not null,
  audience_id uuid not null,

  subject_override text,
  preheader_override text,

  recurrence_type text not null
    check (recurrence_type in ('daily', 'weekly', 'monthly')),

  recurrence_interval integer not null default 1
    check (recurrence_interval between 1 and 365),

  -- ISO weekday:
  -- Monday = 1 ... Sunday = 7
  weekdays smallint[] not null default '{}'::smallint[],

  day_of_month smallint
    check (day_of_month between 1 and 31),

  send_time time without time zone not null default '09:00',

  timezone text not null default 'Africa/Johannesburg',

  starts_on date not null,

  ends_on date,

  max_occurrences integer
    check (max_occurrences is null or max_occurrences > 0),

  occurrence_count integer not null default 0
    check (occurrence_count >= 0),

  next_run_at timestamptz,
  last_run_at timestamptz,

  enabled boolean not null default true,

  status text not null default 'active'
    check (
      status in (
        'active',
        'paused',
        'completed',
        'cancelled',
        'failed'
      )
    ),

  requires_approval boolean not null default false,

  track_opens boolean not null default true,
  track_clicks boolean not null default true,

  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),

  created_by uuid
    references auth.users(id) on delete set null,

  updated_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketing_campaign_series_company_id_id_key
    unique (company_id, id),

  constraint marketing_campaign_series_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict,

  constraint marketing_campaign_series_email_account_fkey
    foreign key (company_id, email_account_id)
    references public.email_account(company_id, id)
    on delete restrict,

  constraint marketing_campaign_series_template_fkey
    foreign key (company_id, template_id)
    references public.communication_template(company_id, id)
    on delete restrict,

  constraint marketing_campaign_series_template_version_fkey
    foreign key (company_id, template_version_id)
    references public.communication_template_version(company_id, id)
    on delete restrict,

  constraint marketing_campaign_series_audience_fkey
    foreign key (company_id, audience_id)
    references public.marketing_audience(company_id, id)
    on delete restrict,

  constraint marketing_campaign_series_dates_check
    check (ends_on is null or ends_on >= starts_on),

  constraint marketing_campaign_series_weekdays_check
    check (
      weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    )
);
create index if not exists marketing_campaign_series_due_idx
  on public.marketing_campaign_series (
    company_id,
    status,
    enabled,
    next_run_at
  );
create index if not exists marketing_campaign_series_account_idx
  on public.marketing_campaign_series (
    company_id,
    email_account_id
  );
create index if not exists marketing_campaign_series_audience_idx
  on public.marketing_campaign_series (
    company_id,
    audience_id
  );
-- =========================================================
-- Every occurrence will eventually produce its own
-- real email_campaign row.
-- =========================================================

create table if not exists public.marketing_campaign_series_run (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id) on delete cascade,

  series_id uuid not null,

  campaign_id uuid,

  occurrence_no integer not null
    check (occurrence_no > 0),

  scheduled_for timestamptz not null,

  status text not null default 'planned'
    check (
      status in (
        'planned',
        'created',
        'prepared',
        'queued',
        'completed',
        'skipped',
        'failed'
      )
    ),

  error_message text,

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketing_campaign_series_run_company_id_id_key
    unique (company_id, id),

  constraint marketing_campaign_series_run_series_fkey
    foreign key (company_id, series_id)
    references public.marketing_campaign_series(company_id, id)
    on delete cascade,

  constraint marketing_campaign_series_run_campaign_fkey
    foreign key (company_id, campaign_id)
    references public.email_campaign(company_id, id)
    on delete set null,

  constraint marketing_campaign_series_run_occurrence_key
    unique (company_id, series_id, occurrence_no),

  constraint marketing_campaign_series_run_schedule_key
    unique (company_id, series_id, scheduled_for)
);
create index if not exists marketing_campaign_series_run_status_idx
  on public.marketing_campaign_series_run (
    company_id,
    series_id,
    status,
    scheduled_for
  );
-- =========================================================
-- updated_at triggers
-- =========================================================

drop trigger if exists marketing_campaign_series_set_updated_at
  on public.marketing_campaign_series;
create trigger marketing_campaign_series_set_updated_at
before update on public.marketing_campaign_series
for each row
execute function public.set_updated_at();
drop trigger if exists marketing_campaign_series_run_set_updated_at
  on public.marketing_campaign_series_run;
create trigger marketing_campaign_series_run_set_updated_at
before update on public.marketing_campaign_series_run
for each row
execute function public.set_updated_at();
-- =========================================================
-- Calculate next recurring send time.
--
-- We deliberately calculate in the series timezone,
-- then convert back to timestamptz.
-- =========================================================

create or replace function public.marketing_compute_next_series_run(
  p_recurrence_type text,
  p_interval integer,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_send_time time without time zone,
  p_timezone text,
  p_starts_on date,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local_after timestamp without time zone;
  v_date date;
  v_candidate_local timestamp without time zone;
  v_candidate timestamptz;

  v_week_index integer;
  v_month_index integer;
  v_rule_day integer;
  v_last_day integer;

  v_weekdays smallint[];

  v_counter integer := 0;
begin
  if p_interval is null or p_interval < 1 then
    raise exception 'Recurrence interval must be at least 1';
  end if;

  if p_recurrence_type not in ('daily', 'weekly', 'monthly') then
    raise exception 'Unsupported recurrence type';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'Invalid timezone: %', p_timezone;
  end if;

  v_local_after := p_after at time zone p_timezone;

  v_date :=
    greatest(
      p_starts_on,
      v_local_after::date
    );

  v_weekdays :=
    case
      when p_weekdays is null
        or cardinality(p_weekdays) = 0
      then array[
        extract(isodow from p_starts_on)::smallint
      ]
      else p_weekdays
    end;

  -- Look ahead up to roughly 10 years.
  while v_counter <= 3660 loop

    if p_recurrence_type = 'daily' then

      if mod(
        (v_date - p_starts_on),
        p_interval
      ) = 0 then

        v_candidate_local :=
          v_date::timestamp + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local at time zone p_timezone;

          return v_candidate;
        end if;

      end if;


    elsif p_recurrence_type = 'weekly' then

      v_week_index :=
        floor(
          (v_date - p_starts_on)::numeric / 7
        )::integer;

      if v_week_index >= 0
         and mod(v_week_index, p_interval) = 0
         and extract(isodow from v_date)::smallint
             = any(v_weekdays)
      then

        v_candidate_local :=
          v_date::timestamp + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local at time zone p_timezone;

          return v_candidate;
        end if;

      end if;


    elsif p_recurrence_type = 'monthly' then

      v_month_index :=
        (
          extract(year from v_date)::integer
          - extract(year from p_starts_on)::integer
        ) * 12
        +
        (
          extract(month from v_date)::integer
          - extract(month from p_starts_on)::integer
        );

      v_rule_day :=
        coalesce(
          p_day_of_month,
          extract(day from p_starts_on)::integer
        );

      v_last_day :=
        extract(
          day from (
            date_trunc('month', v_date::timestamp)
            + interval '1 month'
            - interval '1 day'
          )
        )::integer;

      if v_month_index >= 0
         and mod(v_month_index, p_interval) = 0
         and extract(day from v_date)::integer
             = least(v_rule_day, v_last_day)
      then

        v_candidate_local :=
          v_date::timestamp + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local at time zone p_timezone;

          return v_candidate;
        end if;

      end if;

    end if;

    v_date := v_date + 1;
    v_counter := v_counter + 1;

  end loop;

  return null;
end;
$$;
-- =========================================================
-- RLS
-- =========================================================

alter table public.marketing_campaign_series
  enable row level security;
alter table public.marketing_campaign_series_run
  enable row level security;
drop policy if exists marketing_campaign_series_select_policy
  on public.marketing_campaign_series;
create policy marketing_campaign_series_select_policy
on public.marketing_campaign_series
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('marketing.view')
);
drop policy if exists marketing_campaign_series_run_select_policy
  on public.marketing_campaign_series_run;
create policy marketing_campaign_series_run_select_policy
on public.marketing_campaign_series_run
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('marketing.view')
);
revoke all
on public.marketing_campaign_series
from anon;
revoke all
on public.marketing_campaign_series_run
from anon;
revoke insert, update, delete
on public.marketing_campaign_series
from authenticated;
revoke insert, update, delete
on public.marketing_campaign_series_run
from authenticated;
grant select
on public.marketing_campaign_series
to authenticated;
grant select
on public.marketing_campaign_series_run
to authenticated;
-- =========================================================
-- Create / Edit recurring series
-- =========================================================

create or replace function public.marketing_save_recurring_series(
  p_series_id uuid,
  p_name text,
  p_description text,
  p_email_account_id uuid,
  p_template_id uuid,
  p_template_version_id uuid,
  p_audience_id uuid,
  p_subject_override text,
  p_preheader_override text,

  p_recurrence_type text,
  p_interval integer,
  p_weekdays smallint[],
  p_day_of_month smallint,
  p_send_time time without time zone,
  p_timezone text,
  p_starts_on date,
  p_ends_on date,
  p_max_occurrences integer,

  p_requires_approval boolean,
  p_track_opens boolean,
  p_track_clicks boolean,

  p_branch_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();

  v_series public.marketing_campaign_series;

  v_next_run timestamptz;
  v_is_new boolean := false;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
    raise exception 'Permission denied';
  end if;

  if p_name is null
     or char_length(btrim(p_name)) = 0
  then
    raise exception 'Series name is required';
  end if;

  if p_recurrence_type not in (
    'daily',
    'weekly',
    'monthly'
  ) then
    raise exception 'Invalid recurrence type';
  end if;

  if p_interval is null or p_interval < 1 then
    raise exception 'Recurrence interval must be at least 1';
  end if;

  if p_send_time is null then
    raise exception 'Send time is required';
  end if;

  if p_starts_on is null then
    raise exception 'Start date is required';
  end if;

  if p_ends_on is not null
     and p_ends_on < p_starts_on
  then
    raise exception 'End date cannot be before start date';
  end if;

  if p_max_occurrences is not null
     and p_max_occurrences < 1
  then
    raise exception 'Maximum occurrences must be at least 1';
  end if;

  if p_settings is null
     or jsonb_typeof(p_settings) <> 'object'
  then
    raise exception 'settings must be a JSON object';
  end if;

  if p_weekdays is not null
     and not (
       p_weekdays
       <@ array[1,2,3,4,5,6,7]::smallint[]
     )
  then
    raise exception 'Invalid weekday';
  end if;

  if p_day_of_month is not null
     and (
       p_day_of_month < 1
       or p_day_of_month > 31
     )
  then
    raise exception 'Invalid day of month';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'Invalid timezone';
  end if;

  if not public.email_user_can_access_account(
    p_email_account_id,
    'send'
  ) then
    raise exception 'No send access to email account';
  end if;

  if not exists (
    select 1
    from public.communication_template t
    join public.communication_template_version tv
      on tv.company_id = t.company_id
     and tv.template_id = t.id
    where t.company_id = v_company_id
      and t.id = p_template_id
      and t.channel = 'email'
      and t.purpose = 'marketing'
      and t.status = 'active'
      and tv.id = p_template_version_id
      and tv.status = 'published'
  ) then
    raise exception 'Published marketing template not found';
  end if;

  if not exists (
    select 1
    from public.marketing_audience a
    where a.company_id = v_company_id
      and a.id = p_audience_id
      and a.status = 'active'
  ) then
    raise exception 'Active audience not found';
  end if;

  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch b
       where b.company_id = v_company_id
         and b.id = p_branch_id
     )
  then
    raise exception 'Invalid branch';
  end if;


  v_next_run :=
    public.marketing_compute_next_series_run(
      p_recurrence_type,
      p_interval,
      coalesce(p_weekdays, '{}'::smallint[]),
      p_day_of_month,
      p_send_time,
      p_timezone,
      p_starts_on,
      now()
    );


  if p_ends_on is not null
     and v_next_run is not null
     and (
       v_next_run at time zone p_timezone
     )::date > p_ends_on
  then
    v_next_run := null;
  end if;


  if p_series_id is null then

    v_is_new := true;

    insert into public.marketing_campaign_series (
      company_id,
      branch_id,
      name,
      description,

      email_account_id,
      template_id,
      template_version_id,
      audience_id,

      subject_override,
      preheader_override,

      recurrence_type,
      recurrence_interval,
      weekdays,
      day_of_month,
      send_time,
      timezone,

      starts_on,
      ends_on,
      max_occurrences,

      next_run_at,

      enabled,
      status,

      requires_approval,
      track_opens,
      track_clicks,

      settings,

      created_by,
      updated_by
    )
    values (
      v_company_id,
      p_branch_id,
      btrim(p_name),
      nullif(btrim(coalesce(p_description, '')), ''),

      p_email_account_id,
      p_template_id,
      p_template_version_id,
      p_audience_id,

      nullif(
        btrim(coalesce(p_subject_override, '')),
        ''
      ),

      nullif(
        btrim(coalesce(p_preheader_override, '')),
        ''
      ),

      p_recurrence_type,
      p_interval,
      coalesce(
        p_weekdays,
        '{}'::smallint[]
      ),

      p_day_of_month,
      p_send_time,
      p_timezone,

      p_starts_on,
      p_ends_on,
      p_max_occurrences,

      v_next_run,

      v_next_run is not null,

      case
        when v_next_run is null
        then 'completed'
        else 'active'
      end,

      coalesce(p_requires_approval, false),
      coalesce(p_track_opens, true),
      coalesce(p_track_clicks, true),

      p_settings,

      v_user_id,
      v_user_id
    )
    returning *
    into v_series;


  else

    select *
    into v_series
    from public.marketing_campaign_series s
    where s.id = p_series_id
      and s.company_id = v_company_id
    for update;

    if not found then
      raise exception 'Recurring campaign series not found';
    end if;

    if v_series.status = 'cancelled' then
      raise exception 'Cancelled series cannot be edited';
    end if;

    if v_series.max_occurrences is not null
       and v_series.occurrence_count
           >= coalesce(
             p_max_occurrences,
             v_series.max_occurrences
           )
    then
      v_next_run := null;
    end if;

    update public.marketing_campaign_series
    set
      branch_id = p_branch_id,

      name = btrim(p_name),

      description =
        nullif(
          btrim(coalesce(p_description, '')),
          ''
        ),

      email_account_id = p_email_account_id,
      template_id = p_template_id,
      template_version_id = p_template_version_id,
      audience_id = p_audience_id,

      subject_override =
        nullif(
          btrim(coalesce(p_subject_override, '')),
          ''
        ),

      preheader_override =
        nullif(
          btrim(coalesce(p_preheader_override, '')),
          ''
        ),

      recurrence_type = p_recurrence_type,
      recurrence_interval = p_interval,

      weekdays =
        coalesce(
          p_weekdays,
          '{}'::smallint[]
        ),

      day_of_month = p_day_of_month,

      send_time = p_send_time,
      timezone = p_timezone,

      starts_on = p_starts_on,
      ends_on = p_ends_on,

      max_occurrences = p_max_occurrences,

      next_run_at =
        case
          when status = 'paused'
          then v_next_run

          when v_next_run is null
          then null

          else v_next_run
        end,

      enabled =
        case
          when status = 'paused'
          then false

          else v_next_run is not null
        end,

      status =
        case
          when status = 'paused'
          then 'paused'

          when v_next_run is null
          then 'completed'

          else 'active'
        end,

      requires_approval =
        coalesce(
          p_requires_approval,
          false
        ),

      track_opens =
        coalesce(
          p_track_opens,
          true
        ),

      track_clicks =
        coalesce(
          p_track_clicks,
          true
        ),

      settings = p_settings,

      updated_by = v_user_id

    where id = p_series_id
      and company_id = v_company_id

    returning *
    into v_series;

  end if;


  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    v_user_id,

    case
      when v_is_new then 'create'
      else 'update'
    end,

    'marketing',
    v_series.id,

    case
      when v_is_new
      then 'Recurring email campaign created'
      else 'Recurring email campaign updated'
    end,

    jsonb_build_object(
      'series_id',
      v_series.id,

      'recurrence_type',
      v_series.recurrence_type,

      'recurrence_interval',
      v_series.recurrence_interval,

      'next_run_at',
      v_series.next_run_at,

      'timezone',
      v_series.timezone
    )
  );


  return jsonb_build_object(
    'ok',
    true,

    'series_id',
    v_series.id,

    'status',
    v_series.status,

    'next_run_at',
    v_series.next_run_at,

    'occurrence_count',
    v_series.occurrence_count
  );
end;
$$;
-- =========================================================
-- Pause recurring campaign
-- =========================================================

create or replace function public.marketing_pause_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission(
    'marketing.manage'
  ) then
    raise exception 'Permission denied';
  end if;

  update public.marketing_campaign_series
  set
    enabled = false,
    status = 'paused',
    updated_by = v_user_id
  where id = p_series_id
    and company_id = v_company_id
    and status = 'active';

  if not found then
    raise exception 'Active recurring campaign not found';
  end if;

  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    v_user_id,
    'pause',
    'marketing',
    p_series_id,
    'Recurring email campaign paused',
    jsonb_build_object(
      'series_id',
      p_series_id
    )
  );

  return jsonb_build_object(
    'ok',
    true,
    'series_id',
    p_series_id,
    'status',
    'paused'
  );
end;
$$;
-- =========================================================
-- Resume recurring campaign
-- =========================================================

create or replace function public.marketing_resume_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();

  v_series public.marketing_campaign_series;
  v_next_run timestamptz;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission(
    'marketing.manage'
  ) then
    raise exception 'Permission denied';
  end if;

  select *
  into v_series
  from public.marketing_campaign_series s
  where s.id = p_series_id
    and s.company_id = v_company_id
    and s.status = 'paused'
  for update;

  if not found then
    raise exception 'Paused recurring campaign not found';
  end if;

  if v_series.max_occurrences is not null
     and v_series.occurrence_count
         >= v_series.max_occurrences
  then
    raise exception 'Maximum occurrence count has been reached';
  end if;

  v_next_run :=
    public.marketing_compute_next_series_run(
      v_series.recurrence_type,
      v_series.recurrence_interval,
      v_series.weekdays,
      v_series.day_of_month,
      v_series.send_time,
      v_series.timezone,
      v_series.starts_on,
      now()
    );

  if v_series.ends_on is not null
     and v_next_run is not null
     and (
       v_next_run
       at time zone v_series.timezone
     )::date > v_series.ends_on
  then
    v_next_run := null;
  end if;

  if v_next_run is null then
    raise exception 'This recurrence has no future send date';
  end if;

  update public.marketing_campaign_series
  set
    enabled = true,
    status = 'active',
    next_run_at = v_next_run,
    updated_by = v_user_id
  where id = p_series_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    v_user_id,
    'resume',
    'marketing',
    p_series_id,
    'Recurring email campaign resumed',
    jsonb_build_object(
      'series_id',
      p_series_id,
      'next_run_at',
      v_next_run
    )
  );

  return jsonb_build_object(
    'ok',
    true,
    'series_id',
    p_series_id,
    'status',
    'active',
    'next_run_at',
    v_next_run
  );
end;
$$;
-- =========================================================
-- Cancel recurring campaign permanently
-- =========================================================

create or replace function public.marketing_cancel_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission(
    'marketing.manage'
  ) then
    raise exception 'Permission denied';
  end if;

  update public.marketing_campaign_series
  set
    enabled = false,
    status = 'cancelled',
    next_run_at = null,
    updated_by = v_user_id
  where id = p_series_id
    and company_id = v_company_id
    and status not in ('cancelled', 'completed');

  if not found then
    raise exception 'Recurring campaign cannot be cancelled';
  end if;

  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    v_user_id,
    'cancel',
    'marketing',
    p_series_id,
    'Recurring email campaign cancelled',
    jsonb_build_object(
      'series_id',
      p_series_id
    )
  );

  return jsonb_build_object(
    'ok',
    true,
    'series_id',
    p_series_id,
    'status',
    'cancelled'
  );
end;
$$;
-- =========================================================
-- Permissions
-- =========================================================

revoke all
on function public.marketing_compute_next_series_run(
  text,
  integer,
  smallint[],
  smallint,
  time without time zone,
  text,
  date,
  timestamptz
)
from public, anon;
revoke all
on function public.marketing_save_recurring_series(
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  smallint[],
  smallint,
  time without time zone,
  text,
  date,
  date,
  integer,
  boolean,
  boolean,
  boolean,
  uuid,
  jsonb
)
from public, anon;
revoke all
on function public.marketing_pause_recurring_series(uuid)
from public, anon;
revoke all
on function public.marketing_resume_recurring_series(uuid)
from public, anon;
revoke all
on function public.marketing_cancel_recurring_series(uuid)
from public, anon;
grant execute
on function public.marketing_compute_next_series_run(
  text,
  integer,
  smallint[],
  smallint,
  time without time zone,
  text,
  date,
  timestamptz
)
to authenticated;
grant execute
on function public.marketing_save_recurring_series(
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  smallint[],
  smallint,
  time without time zone,
  text,
  date,
  date,
  integer,
  boolean,
  boolean,
  boolean,
  uuid,
  jsonb
)
to authenticated;
grant execute
on function public.marketing_pause_recurring_series(uuid)
to authenticated;
grant execute
on function public.marketing_resume_recurring_series(uuid)
to authenticated;
grant execute
on function public.marketing_cancel_recurring_series(uuid)
to authenticated;
