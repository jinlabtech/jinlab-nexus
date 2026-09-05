-- ============================================================
-- JINLAB Nexus
-- Accounting source hardening
--
-- Sales Order payments are legitimate accounting sources:
--
--   DR Bank / Cash / Payment Clearing
--      CR Customer Deposits
-- ============================================================


alter table public.journal_entry
drop constraint if exists
journal_entry_source_type_check;


alter table public.journal_entry
add constraint
journal_entry_source_type_check
check (
  source_type in (
    'manual',
    'invoice',
    'invoice_payment',
    'sales_order_payment',
    'purchase',
    'supplier_payment',
    'expense',
    'bank_transaction',
    'pos_sale',
    'opening_balance',
    'adjustment',
    'reversal'
  )
);


-- ============================================================
-- Retry any pre-existing Sales Order payments that may not yet
-- have reached the ledger.
--
-- This is idempotent:
-- post_sales_order_payment_to_ledger() returns the existing
-- journal when one already exists.
-- ============================================================

do $$
declare
  v_payment record;
begin

  for v_payment in

    select sop.id
    from public.sales_order_payment sop

    where not exists (
      select 1
      from public.journal_entry je

      where je.company_id =
        sop.company_id

        and je.source_type =
          'sales_order_payment'

        and je.source_id =
          sop.id

        and je.source_event =
          'received'
    )

  loop

    begin

      perform
        public.post_sales_order_payment_to_ledger(
          v_payment.id
        );

    exception
      when others then

        -- Existing automatic exception infrastructure
        -- will handle future trigger events.
        -- Migration must not fabricate accounting data.

        null;

    end;

  end loop;

end;
$$;


-- ============================================================
-- END
-- ============================================================
