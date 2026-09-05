-- ============================================================
-- JINLAB Nexus
-- Protect scheduled financial years from premature posting
-- ============================================================

create or replace function
public.validate_financial_year_before_journal_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_status text;
begin

  if new.status = 'posted'
     and old.status <> 'posted' then

    if new.accounting_period_id is null then
      raise exception
        'Journal cannot be posted without an accounting period.';
    end if;

    select fy.status
    into v_year_status

    from public.accounting_period ap

    join public.accounting_financial_year fy
      on fy.id =
        ap.financial_year_id

    where ap.id =
      new.accounting_period_id;

    if v_year_status is null then
      raise exception
        'Journal accounting period is not linked to a financial year.';
    end if;

    if v_year_status = 'scheduled' then
      raise exception
        'This financial year is scheduled and is not open for posting yet.';
    end if;

    if v_year_status = 'closed' then
      raise exception
        'This financial year is closed.';
    end if;

    if v_year_status = 'locked' then
      raise exception
        'This financial year is locked.';
    end if;

  end if;

  return new;

end;
$$;


drop trigger if exists
journal_entry_validate_financial_year
on public.journal_entry;


create trigger
journal_entry_validate_financial_year
before update
on public.journal_entry
for each row
execute function
public.validate_financial_year_before_journal_post();
