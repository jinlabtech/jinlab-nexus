-- ============================================================
-- JINLAB Nexus
-- Payment Plan Allocation Engine
-- ============================================================

create or replace function public.rebuild_invoice_payment_plan(
  p_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.invoice_payment_plan%rowtype;
  v_installment record;
  v_payment record;

  v_remaining_payment numeric(14,2);
  v_allocation numeric(14,2);

  v_total_paid numeric(14,2);
  v_invoice_balance numeric(14,2);

  v_next_payment_date date;
  v_all_paid boolean;
begin

  -- ----------------------------------------------------------
  -- Lock the payment plan
  -- ----------------------------------------------------------

  select *
  into v_plan
  from public.invoice_payment_plan
  where id = p_plan_id
  for update;

  if not found then
    return;
  end if;

  if v_plan.status = 'cancelled' then
    return;
  end if;


  -- ----------------------------------------------------------
  -- Reset schedule
  --
  -- The schedule is derived from immutable payment records.
  -- This makes recalculation deterministic.
  -- ----------------------------------------------------------

  update public.invoice_payment_plan_installment
  set
    amount_paid = 0,
    status =
      case
        when status = 'cancelled'
          then 'cancelled'
        else 'pending'
      end,
    paid_at = null,
    updated_at = now()
  where payment_plan_id = p_plan_id;


  -- ----------------------------------------------------------
  -- Allocate every payment chronologically
  -- ----------------------------------------------------------

  for v_payment in

    select
      ip.id,
      ip.amount,
      ip.payment_date,
      ip.created_at,
      ip.installment_id

    from public.invoice_payment ip

    where ip.invoice_id =
      v_plan.invoice_id

      and (
        ip.payment_plan_id =
          p_plan_id

        or ip.payment_plan_id
          is null
      )

    order by
      ip.payment_date asc,
      ip.created_at asc,
      ip.id asc

  loop

    v_remaining_payment :=
      v_payment.amount;


    -- --------------------------------------------------------
    -- Explicit installment first
    -- --------------------------------------------------------

    if v_payment.installment_id
      is not null then

      select
        i.*
      into v_installment
      from public.invoice_payment_plan_installment i
      where i.id =
        v_payment.installment_id
        and i.payment_plan_id =
          p_plan_id
        and i.status <> 'cancelled'
      for update;

      if found then

        v_allocation :=
          least(
            v_remaining_payment,
            greatest(
              v_installment.amount_due -
              v_installment.amount_paid,
              0
            )
          );

        if v_allocation > 0 then

          update public.invoice_payment_plan_installment
          set
            amount_paid =
              amount_paid +
              v_allocation,

            updated_at = now()

          where id =
            v_installment.id;

          v_remaining_payment :=
            v_remaining_payment -
            v_allocation;

        end if;

      end if;

    end if;


    -- --------------------------------------------------------
    -- Remaining money goes oldest outstanding first
    -- --------------------------------------------------------

    while v_remaining_payment > 0 loop

      select
        i.*
      into v_installment

      from public.invoice_payment_plan_installment i

      where i.payment_plan_id =
        p_plan_id

        and i.status <>
          'cancelled'

        and i.amount_paid <
          i.amount_due

      order by
        i.due_date asc,
        i.installment_number asc

      limit 1
      for update;

      exit when not found;


      v_allocation :=
        least(
          v_remaining_payment,
          v_installment.amount_due -
          v_installment.amount_paid
        );


      update public.invoice_payment_plan_installment
      set
        amount_paid =
          amount_paid +
          v_allocation,

        updated_at = now()

      where id =
        v_installment.id;


      v_remaining_payment :=
        v_remaining_payment -
        v_allocation;

    end loop;

  end loop;


  -- ----------------------------------------------------------
  -- Calculate installment status
  -- ----------------------------------------------------------

  update public.invoice_payment_plan_installment
  set

    status =
      case

        when status = 'cancelled'
          then 'cancelled'

        when amount_paid >=
          amount_due
          then 'paid'

        when amount_paid > 0
          then 'partially_paid'

        when due_date < current_date
          then 'overdue'

        else 'pending'

      end,

    paid_at =
      case

        when amount_paid >=
          amount_due

        then coalesce(
          paid_at,
          now()
        )

        else null

      end,

    updated_at = now()

  where payment_plan_id =
    p_plan_id;


  -- ----------------------------------------------------------
  -- Determine next outstanding installment
  -- ----------------------------------------------------------

  select
    min(due_date)
  into
    v_next_payment_date

  from public.invoice_payment_plan_installment

  where payment_plan_id =
    p_plan_id

    and status in (
      'pending',
      'partially_paid',
      'overdue'
    );


  -- ----------------------------------------------------------
  -- Determine whether schedule is complete
  -- ----------------------------------------------------------

  select
    not exists (
      select 1

      from public.invoice_payment_plan_installment

      where payment_plan_id =
        p_plan_id

        and status not in (
          'paid',
          'cancelled'
        )
    )
  into
    v_all_paid;


  -- ----------------------------------------------------------
  -- Read invoice balance
  -- ----------------------------------------------------------

  select
    balance_due
  into
    v_invoice_balance

  from public.invoice

  where id =
    v_plan.invoice_id;


  select
    coalesce(
      sum(amount),
      0
    )
  into
    v_total_paid

  from public.invoice_payment

  where invoice_id =
    v_plan.invoice_id;


  -- ----------------------------------------------------------
  -- Update payment plan
  -- ----------------------------------------------------------

  update public.invoice_payment_plan
  set

    next_payment_date =
      case
        when v_all_paid
          then null
        else v_next_payment_date
      end,

    status =
      case

        when status = 'cancelled'
          then 'cancelled'

        when
          v_all_paid
          and coalesce(
            v_invoice_balance,
            0
          ) <= 0
          then 'completed'

        when status = 'draft'
          and v_total_paid > 0
          then 'active'

        when status = 'completed'
          and (
            not v_all_paid
            or coalesce(
              v_invoice_balance,
              0
            ) > 0
          )
          then 'active'

        else status

      end,

    updated_at = now()

  where id =
    p_plan_id;

end;
$$;


-- ============================================================
-- Automatically rebuild relevant payment plan
-- whenever an invoice payment changes.
-- ============================================================

create or replace function public.invoice_payment_plan_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin

  if tg_op = 'DELETE' then

    v_plan_id :=
      old.payment_plan_id;

    if v_plan_id is null then

      select id
      into v_plan_id

      from public.invoice_payment_plan

      where invoice_id =
        old.invoice_id

        and status in (
          'draft',
          'active',
          'completed'
        )

      order by created_at desc
      limit 1;

    end if;

    if v_plan_id is not null then
      perform
        public.rebuild_invoice_payment_plan(
          v_plan_id
        );
    end if;

    return old;

  end if;


  v_plan_id :=
    new.payment_plan_id;


  if v_plan_id is null then

    select id
    into v_plan_id

    from public.invoice_payment_plan

    where invoice_id =
      new.invoice_id

      and status in (
        'draft',
        'active',
        'completed'
      )

    order by created_at desc
    limit 1;

  end if;


  if v_plan_id is not null then

    perform
      public.rebuild_invoice_payment_plan(
        v_plan_id
      );

  end if;


  -- If UPDATE moved payment between plans,
  -- rebuild the old plan too.

  if
    tg_op = 'UPDATE'
    and old.payment_plan_id
      is distinct from
      new.payment_plan_id
    and old.payment_plan_id
      is not null
  then

    perform
      public.rebuild_invoice_payment_plan(
        old.payment_plan_id
      );

  end if;


  return new;

end;
$$;


drop trigger if exists
invoice_payment_sync_payment_plan
on public.invoice_payment;


create trigger
invoice_payment_sync_payment_plan

after insert or update or delete
on public.invoice_payment

for each row
execute function
public.invoice_payment_plan_sync();


-- ============================================================
-- Rebuild existing plans once
-- ============================================================

do $$
declare
  v_plan record;
begin

  for v_plan in

    select id
    from public.invoice_payment_plan
    where status in (
      'draft',
      'active',
      'completed'
    )

  loop

    perform
      public.rebuild_invoice_payment_plan(
        v_plan.id
      );

  end loop;

end;
$$;
