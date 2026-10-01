-- ============================================================
-- JINLAB Nexus
-- Sprint 20.12 - POS Analytics and Fraud-Risk Signals
-- ============================================================


-- ============================================================
-- 1. Permissions
-- ============================================================

insert into public.permissions (
  permission_name
)
values
  ('pos.analytics.view'),
  ('pos.analytics.manage')
on conflict (permission_name)
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
     'pos.analytics.view'
where r.role_name in (
  'owner',
  'admin',
  'manager'
)
on conflict do nothing;
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
     'pos.analytics.manage'
where r.role_name in (
  'owner',
  'admin'
)
on conflict do nothing;
-- ============================================================
-- 2. POS analytics / risk workspace
-- ============================================================

create or replace function public.get_pos_analytics_workspace(
  p_branch_id uuid default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_company_id uuid;
  v_days integer;

  v_from timestamptz;

  v_gross_sales numeric := 0;
  v_sale_count integer := 0;

  v_refund_total numeric := 0;
  v_return_count integer := 0;

  v_net_sales numeric := 0;

  v_reprint_count integer := 0;

  v_discounted_line_count integer := 0;

  v_cash_shortage_total numeric := 0;
  v_cash_overage_total numeric := 0;

  v_expired_approvals integer := 0;
  v_rejected_approvals integer := 0;

begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'pos.analytics.view'
  ) then
    raise exception
      'Permission denied: pos.analytics.view';
  end if;


  v_company_id :=
    public.current_company_id();


  v_days :=
    greatest(
      1,
      least(
        coalesce(
          p_days,
          30
        ),
        365
      )
    );


  v_from :=
    now()
    -
    make_interval(
      days => v_days
    );


  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch
       where id = p_branch_id
         and company_id = v_company_id
     )
  then
    raise exception 'Branch could not be found.';
  end if;


  -- ==========================================================
  -- Sales
  -- ==========================================================

  select
    coalesce(
      sum(ps.total_amount),
      0
    ),
    count(*)
  into
    v_gross_sales,
    v_sale_count
  from public.pos_sale ps
  where ps.company_id =
        v_company_id

    and ps.status =
        'completed'

    and ps.created_at >=
        v_from

    and (
      p_branch_id is null
      or ps.branch_id =
         p_branch_id
    );


  -- ==========================================================
  -- Returns
  -- ==========================================================

  select
    coalesce(
      sum(pr.refund_total),
      0
    ),
    count(*)
  into
    v_refund_total,
    v_return_count
  from public.pos_return pr
  where pr.company_id =
        v_company_id

    and pr.status =
        'completed'

    and pr.completed_at >=
        v_from

    and (
      p_branch_id is null
      or pr.branch_id =
         p_branch_id
    );


  v_net_sales :=
    round(
      v_gross_sales -
      v_refund_total,
      2
    );


  -- ==========================================================
  -- Receipt reprints
  -- ==========================================================

  select count(*)
  into v_reprint_count
  from public.pos_receipt_print_event pe

  join public.pos_sale ps
    on ps.id =
       pe.pos_sale_id
   and ps.company_id =
       pe.company_id

  where pe.company_id =
        v_company_id

    and pe.print_type =
        'reprint'

    and pe.printed_at >=
        v_from

    and (
      p_branch_id is null
      or ps.branch_id =
         p_branch_id
    );


  -- ==========================================================
  -- Manual discount / override activity
  -- ==========================================================

  select count(*)
  into v_discounted_line_count

  from public.pos_sale_item psi

  join public.pos_sale ps
    on ps.id =
       psi.pos_sale_id
   and ps.company_id =
       psi.company_id

  where psi.company_id =
        v_company_id

    and ps.created_at >=
        v_from

    and ps.status =
        'completed'

    and (
      coalesce(
        psi.discount_value,
        0
      ) > 0

      or (
        psi.automatic_unit_price is not null
        and psi.invoice_unit_price <
            psi.automatic_unit_price
      )
    )

    and (
      p_branch_id is null
      or ps.branch_id =
         p_branch_id
    );


  -- ==========================================================
  -- Till variances
  -- ==========================================================

  select

    coalesce(
      sum(
        abs(
          s.cash_difference
        )
      )
      filter (
        where s.cash_difference < 0
      ),
      0
    ),

    coalesce(
      sum(
        s.cash_difference
      )
      filter (
        where s.cash_difference > 0
      ),
      0
    )

  into
    v_cash_shortage_total,
    v_cash_overage_total

  from public.pos_till_session s

  where s.company_id =
        v_company_id

    and s.status =
        'closed'

    and s.closed_at >=
        v_from

    and (
      p_branch_id is null
      or s.branch_id =
         p_branch_id
    );


  -- ==========================================================
  -- Approval anomalies
  -- ==========================================================

  select

    count(*)
      filter (
        where ar.status =
              'expired'
      ),

    count(*)
      filter (
        where ar.status =
              'rejected'
      )

  into
    v_expired_approvals,
    v_rejected_approvals

  from public.pos_approval_request ar

  where ar.company_id =
        v_company_id

    and ar.created_at >=
        v_from

    and (
      p_branch_id is null
      or ar.branch_id =
         p_branch_id
    );


  -- ==========================================================
  -- Result
  -- ==========================================================

  return jsonb_build_object(

    'ok',
    true,

    'days',
    v_days,

    'can_manage',
    public.current_user_has_permission(
      'pos.analytics.manage'
    ),


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


    'summary',
    jsonb_build_object(

      'gross_sales',
      round(
        v_gross_sales,
        2
      ),

      'refund_total',
      round(
        v_refund_total,
        2
      ),

      'net_sales',
      v_net_sales,

      'sale_count',
      v_sale_count,

      'return_count',
      v_return_count,

      'receipt_reprints',
      v_reprint_count,

      'discounted_lines',
      v_discounted_line_count,

      'cash_shortage_total',
      round(
        v_cash_shortage_total,
        2
      ),

      'cash_overage_total',
      round(
        v_cash_overage_total,
        2
      ),

      'expired_approvals',
      v_expired_approvals,

      'rejected_approvals',
      v_rejected_approvals

    ),


    -- ========================================================
    -- Risk signals
    -- ========================================================

    'risk_signals',
    coalesce(
      (
        select jsonb_agg(
          x.obj
          order by
            x.risk_score desc,
            x.event_at desc
        )

        from (

          -- --------------------------------------------------
          -- Cash shortages
          -- --------------------------------------------------

          select

            s.closed_at as event_at,

            case
              when abs(
                s.cash_difference
              ) >= 500
                then 95

              when abs(
                s.cash_difference
              ) >= 200
                then 85

              when abs(
                s.cash_difference
              ) >= 50
                then 70

              else 50
            end
            as risk_score,


            jsonb_build_object(

              'type',
              'cash_shortage',

              'title',
              'Till cash shortage',

              'description',
              format(
                '%s closed %s short.',
                coalesce(
                  up.full_name,
                  'Cashier'
                ),
                to_char(
                  abs(
                    s.cash_difference
                  ),
                  'FM999999990.00'
                )
              ),

              'risk_score',
              case
                when abs(
                  s.cash_difference
                ) >= 500
                  then 95

                when abs(
                  s.cash_difference
                ) >= 200
                  then 85

                when abs(
                  s.cash_difference
                ) >= 50
                  then 70

                else 50
              end,

              'branch',
              b.branch_name,

              'cashier',
              coalesce(
                up.full_name,
                'Cashier'
              ),

              'reference',
              s.session_number,

              'amount',
              abs(
                s.cash_difference
              ),

              'event_at',
              s.closed_at

            ) as obj


          from public.pos_till_session s

          join public.branch b
            on b.id =
               s.branch_id

          left join public.user_profile up
            on up.user_id =
               s.cashier_user_id
           and up.company_id =
               s.company_id

          where s.company_id =
                v_company_id

            and s.status =
                'closed'

            and s.cash_difference <
                -0.01

            and s.closed_at >=
                v_from

            and (
              p_branch_id is null
              or s.branch_id =
                 p_branch_id
            )


          union all


          -- --------------------------------------------------
          -- Cash overages
          -- --------------------------------------------------

          select

            s.closed_at,

            case
              when s.cash_difference >= 500
                then 80

              when s.cash_difference >= 200
                then 65

              else 40
            end,


            jsonb_build_object(

              'type',
              'cash_overage',

              'title',
              'Till cash overage',

              'description',
              format(
                '%s closed %s over.',
                coalesce(
                  up.full_name,
                  'Cashier'
                ),
                to_char(
                  s.cash_difference,
                  'FM999999990.00'
                )
              ),

              'risk_score',
              case
                when s.cash_difference >= 500
                  then 80

                when s.cash_difference >= 200
                  then 65

                else 40
              end,

              'branch',
              b.branch_name,

              'cashier',
              coalesce(
                up.full_name,
                'Cashier'
              ),

              'reference',
              s.session_number,

              'amount',
              s.cash_difference,

              'event_at',
              s.closed_at

            )


          from public.pos_till_session s

          join public.branch b
            on b.id =
               s.branch_id

          left join public.user_profile up
            on up.user_id =
               s.cashier_user_id
           and up.company_id =
               s.company_id

          where s.company_id =
                v_company_id

            and s.status =
                'closed'

            and s.cash_difference >
                0.01

            and s.closed_at >=
                v_from

            and (
              p_branch_id is null
              or s.branch_id =
                 p_branch_id
            )


          union all


          -- --------------------------------------------------
          -- Large / changed-method refunds
          -- --------------------------------------------------

          select

            pr.completed_at,

            case

              when
                pr.refund_method <>
                coalesce(
                  pr.metadata
                    ->>
                    'original_payment_method',
                  pr.refund_method
                )
                then 85

              when pr.refund_total >= 1000
                then 80

              when pr.refund_total >= 500
                then 65

              else 35

            end,


            jsonb_build_object(

              'type',
              'refund',

              'title',
              case

                when
                  pr.refund_method <>
                  coalesce(
                    pr.metadata
                      ->>
                      'original_payment_method',
                    pr.refund_method
                  )
                then
                  'Refund payment method changed'

                else
                  'POS refund reviewed'

              end,

              'description',
              format(
                '%s refund processed for %s.',
                pr.return_number,
                to_char(
                  pr.refund_total,
                  'FM999999990.00'
                )
              ),

              'risk_score',
              case

                when
                  pr.refund_method <>
                  coalesce(
                    pr.metadata
                      ->>
                      'original_payment_method',
                    pr.refund_method
                  )
                  then 85

                when pr.refund_total >= 1000
                  then 80

                when pr.refund_total >= 500
                  then 65

                else 35

              end,

              'branch',
              b.branch_name,

              'cashier',
              coalesce(
                up.full_name,
                'User'
              ),

              'reference',
              pr.return_number,

              'amount',
              pr.refund_total,

              'event_at',
              pr.completed_at

            )


          from public.pos_return pr

          join public.branch b
            on b.id =
               pr.branch_id

          left join public.user_profile up
            on up.user_id =
               pr.processed_by
           and up.company_id =
               pr.company_id

          where pr.company_id =
                v_company_id

            and pr.status =
                'completed'

            and pr.completed_at >=
                v_from

            and (
              pr.refund_total >= 500

              or pr.refund_method <>
                 coalesce(
                   pr.metadata
                     ->>
                     'original_payment_method',
                   pr.refund_method
                 )
            )

            and (
              p_branch_id is null
              or pr.branch_id =
                 p_branch_id
            )


          union all


          -- --------------------------------------------------
          -- Receipt reprints
          -- --------------------------------------------------

          select

            pe.printed_at,

            35,


            jsonb_build_object(

              'type',
              'receipt_reprint',

              'title',
              'Receipt reprinted',

              'description',
              format(
                'Receipt for %s was reprinted.',
                ps.sale_number
              ),

              'risk_score',
              35,

              'branch',
              b.branch_name,

              'cashier',
              coalesce(
                up.full_name,
                'User'
              ),

              'reference',
              ps.sale_number,

              'amount',
              ps.total_amount,

              'event_at',
              pe.printed_at

            )


          from public.pos_receipt_print_event pe

          join public.pos_sale ps
            on ps.id =
               pe.pos_sale_id
           and ps.company_id =
               pe.company_id

          join public.branch b
            on b.id =
               ps.branch_id

          left join public.user_profile up
            on up.user_id =
               pe.printed_by
           and up.company_id =
               pe.company_id

          where pe.company_id =
                v_company_id

            and pe.print_type =
                'reprint'

            and pe.printed_at >=
                v_from

            and (
              p_branch_id is null
              or ps.branch_id =
                 p_branch_id
            )


          union all


          -- --------------------------------------------------
          -- Expired / rejected discount approvals
          -- --------------------------------------------------

          select

            ar.created_at,

            case
              when ar.status =
                   'rejected'
                then 60

              else 45
            end,


            jsonb_build_object(

              'type',
              'approval',

              'title',
              case
                when ar.status =
                     'rejected'
                  then 'POS approval rejected'

                else
                  'POS approval expired'
              end,

              'description',
              ar.reason,

              'risk_score',
              case
                when ar.status =
                     'rejected'
                  then 60

                else 45
              end,

              'branch',
              b.branch_name,

              'cashier',
              coalesce(
                up.full_name,
                'User'
              ),

              'reference',
              ar.id::text,

              'amount',
              ar.requested_discount_amount,

              'event_at',
              ar.created_at

            )


          from public.pos_approval_request ar

          join public.branch b
            on b.id =
               ar.branch_id

          left join public.user_profile up
            on up.user_id =
               ar.requested_by
           and up.company_id =
               ar.company_id

          where ar.company_id =
                v_company_id

            and ar.status in (
              'expired',
              'rejected'
            )

            and ar.created_at >=
                v_from

            and (
              p_branch_id is null
              or ar.branch_id =
                 p_branch_id
            )

        ) x

      ),
      '[]'::jsonb
    ),


    -- ========================================================
    -- Cashier performance
    -- ========================================================

    'cashiers',
    coalesce(
      (
        select jsonb_agg(
          x.obj
          order by
            x.gross_sales desc
        )

        from (

          select

            coalesce(
              up.full_name,
              'Cashier'
            ) as cashier_name,

            sum(
              ps.total_amount
            ) as gross_sales,


            jsonb_build_object(

              'cashier_user_id',
              ps.cashier_user_id,

              'cashier_name',
              coalesce(
                up.full_name,
                'Cashier'
              ),

              'sale_count',
              count(*),

              'gross_sales',
              round(
                sum(
                  ps.total_amount
                ),
                2
              )

            ) as obj


          from public.pos_sale ps

          left join public.user_profile up
            on up.user_id =
               ps.cashier_user_id
           and up.company_id =
               ps.company_id

          where ps.company_id =
                v_company_id

            and ps.status =
                'completed'

            and ps.created_at >=
                v_from

            and (
              p_branch_id is null
              or ps.branch_id =
                 p_branch_id
            )

          group by
            ps.cashier_user_id,
            up.full_name

        ) x

      ),
      '[]'::jsonb
    )

  );

end;
$$;
revoke execute
on function public.get_pos_analytics_workspace(uuid, integer)
from public, anon;
grant execute
on function public.get_pos_analytics_workspace(uuid, integer)
to authenticated;
