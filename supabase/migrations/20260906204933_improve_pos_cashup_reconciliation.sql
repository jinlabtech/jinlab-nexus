-- ============================================================
-- JINLAB Nexus
-- Sprint 20.11 - Advanced POS cash-up and reconciliation
-- ============================================================


-- ============================================================
-- 1. Link POS returns to the till session that processed them
-- ============================================================

alter table public.pos_return
add column if not exists till_session_id uuid
references public.pos_till_session(id)
on delete set null;
create index if not exists pos_return_till_session_idx
on public.pos_return(till_session_id);
-- ============================================================
-- 2. Automatically attach new returns to the cashier's
--    currently open till session
-- ============================================================

create or replace function public.attach_pos_return_till_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if new.till_session_id is null then

    select s.id
    into new.till_session_id
    from public.pos_till_session s
    where s.company_id = new.company_id
      and s.branch_id = new.branch_id
      and s.cashier_user_id =
          coalesce(
            new.processed_by,
            auth.uid()
          )
      and s.status = 'open'
    order by s.opened_at desc
    limit 1;

  end if;

  return new;

end;
$$;
drop trigger if exists
pos_return_attach_till_session
on public.pos_return;
create trigger pos_return_attach_till_session
before insert on public.pos_return
for each row
execute function public.attach_pos_return_till_session();
-- ============================================================
-- 3. Backfill historic returns where a matching session exists
-- ============================================================

update public.pos_return pr
set till_session_id = (
  select s.id
  from public.pos_till_session s
  where s.company_id = pr.company_id
    and s.branch_id = pr.branch_id
    and s.cashier_user_id = pr.processed_by
    and pr.completed_at >= s.opened_at
    and (
      s.closed_at is null
      or pr.completed_at <= s.closed_at
    )
  order by s.opened_at desc
  limit 1
)
where pr.till_session_id is null
  and pr.processed_by is not null
  and exists (
    select 1
    from public.pos_till_session s
    where s.company_id = pr.company_id
      and s.branch_id = pr.branch_id
      and s.cashier_user_id = pr.processed_by
      and pr.completed_at >= s.opened_at
      and (
        s.closed_at is null
        or pr.completed_at <= s.closed_at
      )
  );
-- ============================================================
-- 4. Refund-aware till reconciliation
-- ============================================================

create or replace function public.get_pos_till_session_totals(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_company_id uuid;
  v_session public.pos_till_session%rowtype;

  v_cash_sales numeric(14,2) := 0;
  v_card_sales numeric(14,2) := 0;
  v_eft_sales numeric(14,2) := 0;
  v_other_sales numeric(14,2) := 0;

  v_cash_refunds numeric(14,2) := 0;
  v_card_refunds numeric(14,2) := 0;
  v_eft_refunds numeric(14,2) := 0;
  v_other_refunds numeric(14,2) := 0;

  v_gross_sales numeric(14,2) := 0;
  v_total_refunds numeric(14,2) := 0;
  v_net_sales numeric(14,2) := 0;

  v_transaction_count integer := 0;
  v_return_count integer := 0;

  v_expected_cash numeric(14,2) := 0;

begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'pos.view'
  ) then
    raise exception 'Permission denied: pos.view';
  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_session
  from public.pos_till_session
  where id = p_session_id
    and company_id = v_company_id;


  if not found then
    raise exception 'Till session could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- SALES
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(ps.total_amount),
      0
    ),
    count(*)
  into
    v_gross_sales,
    v_transaction_count
  from public.pos_sale ps
  where ps.company_id = v_company_id
    and ps.till_session_id = p_session_id
    and ps.status = 'completed';


  select

    coalesce(
      sum(pst.amount)
        filter (
          where pst.payment_method = 'cash'
        ),
      0
    ),

    coalesce(
      sum(pst.amount)
        filter (
          where pst.payment_method = 'card'
        ),
      0
    ),

    coalesce(
      sum(pst.amount)
        filter (
          where pst.payment_method = 'eft'
        ),
      0
    ),

    coalesce(
      sum(pst.amount)
        filter (
          where pst.payment_method = 'other'
        ),
      0
    )

  into
    v_cash_sales,
    v_card_sales,
    v_eft_sales,
    v_other_sales

  from public.pos_sale_tender pst

  join public.pos_sale ps
    on ps.id = pst.pos_sale_id
   and ps.company_id = pst.company_id

  where pst.company_id = v_company_id
    and ps.till_session_id = p_session_id
    and ps.status = 'completed';


  -- ----------------------------------------------------------
  -- REFUNDS
  -- ----------------------------------------------------------

  select

    coalesce(
      sum(prt.amount)
        filter (
          where prt.payment_method = 'cash'
        ),
      0
    ),

    coalesce(
      sum(prt.amount)
        filter (
          where prt.payment_method = 'card'
        ),
      0
    ),

    coalesce(
      sum(prt.amount)
        filter (
          where prt.payment_method = 'eft'
        ),
      0
    ),

    coalesce(
      sum(prt.amount)
        filter (
          where prt.payment_method = 'other'
        ),
      0
    ),

    coalesce(
      sum(prt.amount),
      0
    ),

    count(
      distinct pr.id
    )

  into
    v_cash_refunds,
    v_card_refunds,
    v_eft_refunds,
    v_other_refunds,
    v_total_refunds,
    v_return_count

  from public.pos_return pr

  left join public.pos_return_tender prt
    on prt.pos_return_id = pr.id
   and prt.company_id = pr.company_id

  where pr.company_id = v_company_id
    and pr.till_session_id = p_session_id
    and pr.status = 'completed';


  v_net_sales :=
    round(
      v_gross_sales -
      v_total_refunds,
      2
    );


  v_expected_cash :=
    round(
      v_session.opening_float
      +
      v_cash_sales
      -
      v_cash_refunds,
      2
    );


  return jsonb_build_object(

    'session_id',
    v_session.id,

    'opening_float',
    round(
      v_session.opening_float,
      2
    ),


    'cash_sales',
    round(
      v_cash_sales,
      2
    ),

    'card_sales',
    round(
      v_card_sales,
      2
    ),

    'eft_sales',
    round(
      v_eft_sales,
      2
    ),

    'other_sales',
    round(
      v_other_sales,
      2
    ),


    'cash_refunds',
    round(
      v_cash_refunds,
      2
    ),

    'card_refunds',
    round(
      v_card_refunds,
      2
    ),

    'eft_refunds',
    round(
      v_eft_refunds,
      2
    ),

    'other_refunds',
    round(
      v_other_refunds,
      2
    ),


    'gross_sales',
    round(
      v_gross_sales,
      2
    ),

    'total_refunds',
    round(
      v_total_refunds,
      2
    ),

    'net_sales',
    round(
      v_net_sales,
      2
    ),


    'transaction_count',
    v_transaction_count,

    'return_count',
    v_return_count,


    'expected_cash',
    v_expected_cash
  );

end;
$$;
-- ============================================================
-- 5. Owner / manager cash-up workspace
-- ============================================================

create or replace function public.get_pos_cashup_workspace(
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_company_id uuid;
  v_can_manage boolean;
  v_can_close boolean;

begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'pos.cashup.view'
  ) then
    raise exception
      'Permission denied: pos.cashup.view';
  end if;


  v_company_id :=
    public.current_company_id();


  v_can_manage :=
    public.current_user_has_permission(
      'pos.cashup.manage'
    );


  v_can_close :=
    public.current_user_has_permission(
      'pos.session.close'
    );


  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch b
       where b.id = p_branch_id
         and b.company_id = v_company_id
     )
  then
    raise exception 'Branch could not be found.';
  end if;


  return jsonb_build_object(

    'ok',
    true,

    'can_manage',
    v_can_manage,

    'can_close',
    v_can_close,


    'branches',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            b.id,

            'name',
            b.branch_name
          )
          order by b.branch_name
        )

        from public.branch b

        where b.company_id =
              v_company_id
      ),
      '[]'::jsonb
    ),


    'open_sessions',
    coalesce(
      (
        select jsonb_agg(
          x.obj
          order by x.opened_at desc
        )

        from (
          select

            s.opened_at,

            jsonb_build_object(

              'id',
              s.id,

              'session_number',
              s.session_number,

              'branch_id',
              s.branch_id,

              'branch_name',
              b.branch_name,

              'cashier_user_id',
              s.cashier_user_id,

              'cashier_name',
              coalesce(
                up.full_name,
                'Cashier'
              ),

              'opened_at',
              s.opened_at,

              'opening_float',
              s.opening_float,

              'totals',
              public.get_pos_till_session_totals(
                s.id
              )

            ) as obj

          from public.pos_till_session s

          join public.branch b
            on b.id = s.branch_id

          left join public.user_profile up
            on up.user_id =
               s.cashier_user_id
           and up.company_id =
               s.company_id

          where s.company_id =
                v_company_id

            and s.status =
                'open'

            and (
              p_branch_id is null
              or s.branch_id =
                 p_branch_id
            )

            and (
              v_can_manage
              or s.cashier_user_id =
                 auth.uid()
            )

        ) x
      ),
      '[]'::jsonb
    ),


    'recent_sessions',
    coalesce(
      (
        select jsonb_agg(
          x.obj
          order by x.closed_at desc
        )

        from (
          select

            s.closed_at,

            jsonb_build_object(

              'id',
              s.id,

              'session_number',
              s.session_number,

              'branch_name',
              b.branch_name,

              'cashier_name',
              coalesce(
                up.full_name,
                'Cashier'
              ),

              'opened_at',
              s.opened_at,

              'closed_at',
              s.closed_at,

              'opening_float',
              s.opening_float,

              'gross_sales',
              s.gross_sales,

              'transaction_count',
              s.transaction_count,

              'expected_cash',
              s.expected_cash,

              'counted_cash',
              s.counted_cash,

              'cash_difference',
              s.cash_difference,

              'closing_notes',
              s.closing_notes,

              'reconciliation',
              public.get_pos_till_session_totals(
                s.id
              )

            ) as obj

          from public.pos_till_session s

          join public.branch b
            on b.id = s.branch_id

          left join public.user_profile up
            on up.user_id =
               s.cashier_user_id
           and up.company_id =
               s.company_id

          where s.company_id =
                v_company_id

            and s.status =
                'closed'

            and (
              p_branch_id is null
              or s.branch_id =
                 p_branch_id
            )

            and (
              v_can_manage
              or s.cashier_user_id =
                 auth.uid()
            )

          order by s.closed_at desc

          limit 50

        ) x
      ),
      '[]'::jsonb
    )

  );

end;
$$;
revoke execute
on function public.get_pos_cashup_workspace(uuid)
from public, anon;
grant execute
on function public.get_pos_cashup_workspace(uuid)
to authenticated;
revoke execute
on function public.get_pos_till_session_totals(uuid)
from public, anon;
grant execute
on function public.get_pos_till_session_totals(uuid)
to authenticated;
