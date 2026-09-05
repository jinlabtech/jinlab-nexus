-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2C
-- Posting Exception Recovery
-- ============================================================


-- ============================================================
-- 1. RETRY ACCOUNTING POSTING
-- ============================================================

create or replace function
public.retry_accounting_posting_exception(
  p_exception_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_exception
    public.accounting_posting_exception%rowtype;

  v_journal_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.journal.post'
  ) then
    raise exception
      'Permission denied: accounting.journal.post';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  select *
  into v_exception
  from public.accounting_posting_exception
  where id =
    p_exception_id
    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Accounting exception could not be found.';
  end if;


  if v_exception.status =
     'resolved' then

    return jsonb_build_object(
      'ok',
        true,
      'already_resolved',
        true
    );

  end if;


  -- ----------------------------------------------------------
  -- Retry based on business event
  -- ----------------------------------------------------------

  if v_exception.source_type =
       'invoice'
     and v_exception.source_event =
       'issued' then

    v_journal_id :=
      public.post_invoice_issue_to_ledger(
        v_exception.source_id
      );


  elsif v_exception.source_type =
          'invoice_payment'
        and v_exception.source_event =
          'received' then

    v_journal_id :=
      public.post_invoice_payment_to_ledger(
        v_exception.source_id
      );


  else

    raise exception
      'This accounting exception does not yet support automatic retry.';

  end if;


  if v_journal_id is null then
    raise exception
      'The transaction still cannot be posted. Review the company accounting settings and posting rules.';
  end if;


  update public.accounting_posting_exception
  set
    status =
      'resolved',

    resolved_at =
      now(),

    resolved_by =
      auth.uid()

  where id =
    v_exception.id;


  return jsonb_build_object(
    'ok',
      true,

    'journal_id',
      v_journal_id,

    'exception_id',
      v_exception.id
  );

end;
$$;


revoke all
on function
public.retry_accounting_posting_exception(uuid)
from public;

grant execute
on function
public.retry_accounting_posting_exception(uuid)
to authenticated;


-- ============================================================
-- 2. AUTOMATICALLY RESOLVE EXCEPTION AFTER SUCCESSFUL POST
-- ============================================================

create or replace function
public.resolve_matching_accounting_exception(
  p_company_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  update public.accounting_posting_exception
  set
    status =
      'resolved',

    resolved_at =
      now(),

    resolved_by =
      auth.uid()

  where company_id =
      p_company_id

    and source_type =
      p_source_type

    and source_id =
      p_source_id

    and source_event =
      p_source_event

    and status =
      'open';

end;
$$;


revoke all
on function
public.resolve_matching_accounting_exception(
  uuid,
  text,
  uuid,
  text
)
from public, authenticated;


-- ============================================================
-- 3. RESOLVE WHEN JOURNAL IS SUCCESSFULLY POSTED
-- ============================================================

create or replace function
public.accounting_journal_resolve_exception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if new.status =
       'posted'
     and old.status is distinct from
       new.status

     and new.source_id is not null
     and new.source_event is not null

     and new.source_type in (
       'invoice',
       'invoice_payment'
     ) then

    perform
      public.resolve_matching_accounting_exception(
        new.company_id,
        new.source_type,
        new.source_id,
        new.source_event
      );

  end if;


  return new;

end;
$$;


drop trigger if exists
journal_entry_resolve_accounting_exception
on public.journal_entry;


create trigger
journal_entry_resolve_accounting_exception
after update of status
on public.journal_entry
for each row
execute function
public.accounting_journal_resolve_exception();


-- ============================================================
-- END
-- ============================================================
