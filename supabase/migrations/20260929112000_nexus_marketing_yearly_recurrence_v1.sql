-- =========================================================
-- JINLAB Nexus
-- Marketing recurring schedules: yearly recurrence
-- =========================================================

alter table public.marketing_campaign_series
  drop constraint if exists
    marketing_campaign_series_recurrence_type_check;

alter table public.marketing_campaign_series
  add constraint
    marketing_campaign_series_recurrence_type_check
  check (
    recurrence_type in (
      'daily',
      'weekly',
      'monthly',
      'yearly'
    )
  );


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
  v_year_index integer;

  v_start_year integer;
  v_start_month integer;
  v_candidate_year integer;

  v_rule_day integer;
  v_last_day integer;

  v_weekdays smallint[];

  v_counter integer := 0;
begin
  if p_interval is null or p_interval < 1 then
    raise exception
      'Recurrence interval must be at least 1';
  end if;

  if p_recurrence_type not in (
    'daily',
    'weekly',
    'monthly',
    'yearly'
  ) then
    raise exception 'Unsupported recurrence type';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'Invalid timezone: %', p_timezone;
  end if;

  v_local_after :=
    p_after at time zone p_timezone;


  -- =======================================================
  -- YEARLY
  -- Uses the month/day from starts_on.
  -- 29 February safely becomes the last valid February day
  -- in non-leap years.
  -- =======================================================

  if p_recurrence_type = 'yearly' then

    v_start_year :=
      extract(year from p_starts_on)::integer;

    v_start_month :=
      extract(month from p_starts_on)::integer;

    v_rule_day :=
      extract(day from p_starts_on)::integer;

    v_year_index :=
      greatest(
        0,
        extract(year from v_local_after)::integer
        - v_start_year
      );

    if v_year_index = 0 then
      v_candidate_year := v_start_year;
    else
      v_candidate_year :=
        v_start_year
        +
        (
          (
            v_year_index
            + p_interval
            - 1
          ) / p_interval
        ) * p_interval;
    end if;

    v_last_day :=
      extract(
        day from (
          date_trunc(
            'month',
            make_date(
              v_candidate_year,
              v_start_month,
              1
            )::timestamp
          )
          + interval '1 month'
          - interval '1 day'
        )
      )::integer;

    v_candidate_local :=
      make_date(
        v_candidate_year,
        v_start_month,
        least(v_rule_day, v_last_day)
      )::timestamp
      + p_send_time;

    if v_candidate_local <= v_local_after
       or v_candidate_local::date < p_starts_on
    then

      v_candidate_year :=
        v_candidate_year + p_interval;

      v_last_day :=
        extract(
          day from (
            date_trunc(
              'month',
              make_date(
                v_candidate_year,
                v_start_month,
                1
              )::timestamp
            )
            + interval '1 month'
            - interval '1 day'
          )
        )::integer;

      v_candidate_local :=
        make_date(
          v_candidate_year,
          v_start_month,
          least(v_rule_day, v_last_day)
        )::timestamp
        + p_send_time;

    end if;

    return
      v_candidate_local at time zone p_timezone;

  end if;


  -- =======================================================
  -- EXISTING DAILY / WEEKLY / MONTHLY
  -- =======================================================

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
        extract(
          isodow from p_starts_on
        )::smallint
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
          v_date::timestamp
          + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local
            at time zone p_timezone;

          return v_candidate;
        end if;

      end if;


    elsif p_recurrence_type = 'weekly' then

      v_week_index :=
        floor(
          (v_date - p_starts_on)::numeric / 7
        )::integer;

      if v_week_index >= 0
         and mod(
           v_week_index,
           p_interval
         ) = 0
         and extract(
           isodow from v_date
         )::smallint = any(v_weekdays)
      then

        v_candidate_local :=
          v_date::timestamp
          + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local
            at time zone p_timezone;

          return v_candidate;
        end if;

      end if;


    elsif p_recurrence_type = 'monthly' then

      v_month_index :=
        (
          extract(year from v_date)::integer
          - extract(
              year from p_starts_on
            )::integer
        ) * 12
        +
        (
          extract(month from v_date)::integer
          - extract(
              month from p_starts_on
            )::integer
        );

      v_rule_day :=
        coalesce(
          p_day_of_month,
          extract(
            day from p_starts_on
          )::integer
        );

      v_last_day :=
        extract(
          day from (
            date_trunc(
              'month',
              v_date::timestamp
            )
            + interval '1 month'
            - interval '1 day'
          )
        )::integer;

      if v_month_index >= 0
         and mod(
           v_month_index,
           p_interval
         ) = 0
         and extract(
           day from v_date
         )::integer
             = least(
                 v_rule_day,
                 v_last_day
               )
      then

        v_candidate_local :=
          v_date::timestamp
          + p_send_time;

        if v_candidate_local > v_local_after then
          v_candidate :=
            v_candidate_local
            at time zone p_timezone;

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
