alter table public.journal_entry
drop constraint if exists journal_entry_source_type_check;

alter table public.journal_entry
add constraint journal_entry_source_type_check
check (
  source_type = any(array[
    'manual'::text,
    'invoice'::text,
    'invoice_payment'::text,
    'sales_order_payment'::text,
    'purchase'::text,
    'supplier_payment'::text,
    'expense'::text,
    'bank_transaction'::text,
    'payment_settlement'::text,
    'pos_sale'::text,
    'opening_balance'::text,
    'adjustment'::text,
    'reversal'::text
  ])
);;
