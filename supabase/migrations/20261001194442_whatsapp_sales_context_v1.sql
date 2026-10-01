-- JINLAB Nexus WhatsApp Sales Context v1
-- Adds persistent sales journey, ownership and follow-up state.

alter table public.whatsapp_conversation
  add column if not exists sales_stage text not null default 'enquiry',
  add column if not exists attention_state text not null default 'none',
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_note text,
  add column if not exists sales_value numeric(14,2),
  add column if not exists sales_stage_updated_at timestamptz not null default clock_timestamp();


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_conversation_sales_stage_check'
  ) then
    alter table public.whatsapp_conversation
      add constraint whatsapp_conversation_sales_stage_check
      check (
        sales_stage in (
          'enquiry',
          'qualified',
          'quoted',
          'negotiating',
          'won',
          'paid',
          'lost'
        )
      );
  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_conversation_attention_state_check'
  ) then
    alter table public.whatsapp_conversation
      add constraint whatsapp_conversation_attention_state_check
      check (
        attention_state in (
          'none',
          'waiting_customer',
          'follow_up_due'
        )
      );
  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_conversation_sales_value_check'
  ) then
    alter table public.whatsapp_conversation
      add constraint whatsapp_conversation_sales_value_check
      check (
        sales_value is null
        or sales_value >= 0
      );
  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_conversation_follow_up_note_check'
  ) then
    alter table public.whatsapp_conversation
      add constraint whatsapp_conversation_follow_up_note_check
      check (
        follow_up_note is null
        or length(follow_up_note) <= 1000
      );
  end if;

end
$$;


create index if not exists whatsapp_conversation_assigned_to_idx
  on public.whatsapp_conversation(
    company_id,
    assigned_to,
    last_message_at desc
  )
  where assigned_to is not null;


create index if not exists whatsapp_conversation_follow_up_due_idx
  on public.whatsapp_conversation(
    company_id,
    follow_up_at
  )
  where attention_state = 'follow_up_due'
    and follow_up_at is not null;


create or replace function public.whatsapp_update_sales_context(
  p_conversation_id uuid,
  p_sales_stage text default null,
  p_attention_state text default null,
  p_assigned_to uuid default null,
  p_clear_assignee boolean default false,
  p_follow_up_at timestamptz default null,
  p_clear_follow_up boolean default false,
  p_follow_up_note text default null,
  p_sales_value numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_conversation public.whatsapp_conversation%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;


  v_company_id :=
    public.current_company_id();


  if v_company_id is null
     or not public.current_user_has_permission(
       'whatsapp.send'
     ) then

    raise exception 'WhatsApp sales access denied.'
      using errcode = '42501';

  end if;


  if p_sales_stage is not null
     and p_sales_stage not in (
       'enquiry',
       'qualified',
       'quoted',
       'negotiating',
       'won',
       'paid',
       'lost'
     ) then

    raise exception 'Invalid WhatsApp sales stage.'
      using errcode = '22023';

  end if;


  if p_attention_state is not null
     and p_attention_state not in (
       'none',
       'waiting_customer',
       'follow_up_due'
     ) then

    raise exception 'Invalid WhatsApp attention state.'
      using errcode = '22023';

  end if;


  if p_sales_value is not null
     and p_sales_value < 0 then

    raise exception 'Sales value cannot be negative.'
      using errcode = '22023';

  end if;


  if p_follow_up_note is not null
     and length(p_follow_up_note) > 1000 then

    raise exception 'Follow-up note is too long.'
      using errcode = '22023';

  end if;


  if p_assigned_to is not null
     and not exists (
       select 1
       from public.user_profile up
       where up.user_id = p_assigned_to
         and up.company_id = v_company_id
     ) then

    raise exception 'Assigned user is not in your company.'
      using errcode = '42501';

  end if;


  select *
  into v_conversation
  from public.whatsapp_conversation
  where id = p_conversation_id
    and company_id = v_company_id
  for update;


  if not found then
    raise exception 'Conversation unavailable.'
      using errcode = '42501';
  end if;


  update public.whatsapp_conversation
  set

    sales_stage =
      coalesce(
        p_sales_stage,
        sales_stage
      ),

    sales_stage_updated_at =
      case
        when p_sales_stage is not null
         and p_sales_stage is distinct from sales_stage
        then clock_timestamp()
        else sales_stage_updated_at
      end,

    attention_state =
      coalesce(
        p_attention_state,
        attention_state
      ),

    assigned_to =
      case
        when p_clear_assignee
          then null
        else
          coalesce(
            p_assigned_to,
            assigned_to
          )
      end,

    follow_up_at =
      case
        when p_clear_follow_up
          then null
        else
          coalesce(
            p_follow_up_at,
            follow_up_at
          )
      end,

    follow_up_note =
      case
        when p_clear_follow_up
          then null
        when p_follow_up_note is not null
          then nullif(
            trim(p_follow_up_note),
            ''
          )
        else follow_up_note
      end,

    sales_value =
      coalesce(
        p_sales_value,
        sales_value
      )

  where id = p_conversation_id
    and company_id = v_company_id

  returning *
  into v_conversation;


  return to_jsonb(
    v_conversation
  );

end;
$$;


revoke all
on function public.whatsapp_update_sales_context(
  uuid,
  text,
  text,
  uuid,
  boolean,
  timestamptz,
  boolean,
  text,
  numeric
)
from public, anon, authenticated, service_role;


grant execute
on function public.whatsapp_update_sales_context(
  uuid,
  text,
  text,
  uuid,
  boolean,
  timestamptz,
  boolean,
  text,
  numeric
)
to authenticated;


comment on function public.whatsapp_update_sales_context(
  uuid,
  text,
  text,
  uuid,
  boolean,
  timestamptz,
  boolean,
  text,
  numeric
)
is
  'Permission-checked WhatsApp sales stage, ownership and follow-up update.';
