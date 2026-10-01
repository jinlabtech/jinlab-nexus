
create table if not exists public.communication_unsubscribe_token (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  token text not null unique
    check (char_length(token) between 32 and 200),
  channel text not null default 'email'
    check (channel = 'email'),
  purpose text not null default 'marketing'
    check (purpose = 'marketing'),
  address text not null
    check (char_length(btrim(address)) between 3 and 320),
  campaign_id uuid,
  campaign_recipient_id uuid,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '730 days'),
  created_at timestamptz not null default now(),

  constraint communication_unsubscribe_token_campaign_fkey
    foreign key (company_id, campaign_id)
    references public.email_campaign(company_id, id)
    on delete cascade,

  constraint communication_unsubscribe_token_recipient_fkey
    foreign key (company_id, campaign_recipient_id)
    references public.email_campaign_recipient(company_id, id)
    on delete cascade
);

create unique index if not exists communication_unsubscribe_token_recipient_uidx
  on public.communication_unsubscribe_token(company_id, campaign_recipient_id)
  where campaign_recipient_id is not null;

create index if not exists communication_unsubscribe_token_lookup_idx
  on public.communication_unsubscribe_token(token)
  where used_at is null;

alter table public.communication_unsubscribe_token enable row level security;

revoke all on public.communication_unsubscribe_token from anon, authenticated;
grant select, insert, update on public.communication_unsubscribe_token to service_role;

create or replace function public.communication_issue_unsubscribe_token(
  p_company_id uuid,
  p_address text,
  p_campaign_id uuid,
  p_campaign_recipient_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text := lower(btrim(coalesce(p_address, '')));
  v_existing text;
  v_token text;
begin
  if p_company_id is null
     or p_campaign_id is null
     or p_campaign_recipient_id is null
     or v_address = ''
  then
    raise exception 'Unsubscribe token context is incomplete';
  end if;

  if not exists (
    select 1
    from public.email_campaign_recipient r
    where r.company_id = p_company_id
      and r.id = p_campaign_recipient_id
      and r.campaign_id = p_campaign_id
      and lower(r.email_address) = v_address
  ) then
    raise exception 'Campaign recipient does not match unsubscribe context';
  end if;

  select t.token
  into v_existing
  from public.communication_unsubscribe_token t
  where t.company_id = p_company_id
    and t.campaign_recipient_id = p_campaign_recipient_id
    and t.used_at is null
    and t.expires_at > now()
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_token :=
    replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
    replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.communication_unsubscribe_token (
    company_id,
    token,
    channel,
    purpose,
    address,
    campaign_id,
    campaign_recipient_id
  )
  values (
    p_company_id,
    v_token,
    'email',
    'marketing',
    v_address,
    p_campaign_id,
    p_campaign_recipient_id
  )
  on conflict (company_id, campaign_recipient_id)
    where campaign_recipient_id is not null
  do update
    set token = excluded.token,
        address = excluded.address,
        used_at = null,
        expires_at = now() + interval '730 days'
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.communication_attach_marketing_unsubscribe_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_token text;
begin
  if new.channel = 'email'
     and new.purpose = 'marketing'
     and new.source_type = 'email_campaign'
     and new.source_id is not null
  then
    begin
      v_recipient_id :=
        nullif(new.variables ->> 'campaign_recipient_id', '')::uuid;
    exception
      when invalid_text_representation then
        v_recipient_id := null;
    end;

    if v_recipient_id is null then
      select r.id
      into v_recipient_id
      from public.email_campaign_recipient r
      where r.company_id = new.company_id
        and r.campaign_id = new.source_id
        and lower(r.email_address) = lower(new.recipient_address)
      order by r.created_at, r.id
      limit 1;
    end if;

    if v_recipient_id is null then
      raise exception 'Marketing send job is missing campaign recipient context';
    end if;

    v_token :=
      public.communication_issue_unsubscribe_token(
        new.company_id,
        new.recipient_address,
        new.source_id,
        v_recipient_id
      );

    new.variables :=
      coalesce(new.variables, '{}'::jsonb) ||
      jsonb_build_object(
        'campaign_recipient_id', v_recipient_id,
        'unsubscribe_token', v_token
      );
  end if;

  return new;
end;
$$;

drop trigger if exists communication_send_job_marketing_unsubscribe
  on public.communication_send_job;

create trigger communication_send_job_marketing_unsubscribe
before insert on public.communication_send_job
for each row
execute function public.communication_attach_marketing_unsubscribe_token();

create or replace function public.communication_unsubscribe_by_token(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.communication_unsubscribe_token%rowtype;
  v_now timestamptz := now();
  v_consent_id uuid;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select *
  into v_token
  from public.communication_unsubscribe_token t
  where t.token = btrim(p_token)
    and t.used_at is null
    and t.expires_at > v_now
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select c.id
  into v_consent_id
  from public.communication_consent c
  where c.company_id = v_token.company_id
    and c.channel = 'email'
    and c.purpose = 'marketing'
    and lower(c.address) = lower(v_token.address)
  limit 1
  for update;

  if v_consent_id is null then
    insert into public.communication_consent (
      company_id,
      customer_id,
      channel,
      address,
      purpose,
      status,
      source,
      legal_basis,
      consented_at,
      withdrawn_at,
      evidence,
      created_by
    )
    values (
      v_token.company_id,
      null,
      'email',
      lower(v_token.address),
      'marketing',
      'withdrawn',
      'email_unsubscribe',
      null,
      null,
      v_now,
      jsonb_build_object(
        'unsubscribe_token_id', v_token.id,
        'campaign_id', v_token.campaign_id,
        'campaign_recipient_id', v_token.campaign_recipient_id
      ),
      null
    );
  else
    update public.communication_consent
    set status = 'withdrawn',
        source = 'email_unsubscribe',
        withdrawn_at = v_now,
        evidence =
          coalesce(evidence, '{}'::jsonb) ||
          jsonb_build_object(
            'unsubscribe_token_id', v_token.id,
            'campaign_id', v_token.campaign_id,
            'campaign_recipient_id', v_token.campaign_recipient_id
          ),
        updated_at = v_now
    where id = v_consent_id
      and company_id = v_token.company_id;
  end if;

  if exists (
    select 1
    from public.communication_suppression s
    where s.company_id = v_token.company_id
      and s.channel = 'email'
      and lower(s.address) = lower(v_token.address)
      and s.scope = 'marketing'
      and s.active = true
  ) then
    update public.communication_suppression
    set reason = 'unsubscribed',
        source = 'email_unsubscribe',
        metadata =
          coalesce(metadata, '{}'::jsonb) ||
          jsonb_build_object(
            'unsubscribe_token_id', v_token.id,
            'campaign_id', v_token.campaign_id
          ),
        updated_at = v_now
    where company_id = v_token.company_id
      and channel = 'email'
      and lower(address) = lower(v_token.address)
      and scope = 'marketing'
      and active = true;
  else
    insert into public.communication_suppression (
      company_id,
      customer_id,
      channel,
      address,
      scope,
      reason,
      active,
      source,
      metadata,
      created_by
    )
    values (
      v_token.company_id,
      null,
      'email',
      lower(v_token.address),
      'marketing',
      'unsubscribed',
      true,
      'email_unsubscribe',
      jsonb_build_object(
        'unsubscribe_token_id', v_token.id,
        'campaign_id', v_token.campaign_id
      ),
      null
    );
  end if;

  update public.email_campaign_recipient
  set consent_status = 'withdrawn',
      send_status = case
        when send_status in ('pending','queued') then 'unsubscribed'
        else send_status
      end,
      last_error = case
        when send_status in ('pending','queued') then 'Recipient unsubscribed'
        else last_error
      end,
      updated_at = v_now
  where company_id = v_token.company_id
    and lower(email_address) = lower(v_token.address)
    and send_status in ('pending','queued','sent','delivered');

  update public.communication_unsubscribe_token
  set used_at = v_now
  where id = v_token.id
    and company_id = v_token.company_id;

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
    v_token.company_id,
    null,
    'unsubscribe',
    'marketing',
    v_token.campaign_id,
    'Marketing email recipient unsubscribed',
    jsonb_build_object(
      'address', lower(v_token.address),
      'campaign_id', v_token.campaign_id,
      'campaign_recipient_id', v_token.campaign_recipient_id,
      'unsubscribe_token_id', v_token.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'unsubscribed'
  );
end;
$$;

revoke all on function public.communication_issue_unsubscribe_token(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.communication_unsubscribe_by_token(text)
  from public, anon, authenticated;

grant execute on function public.communication_issue_unsubscribe_token(uuid, text, uuid, uuid)
  to service_role;
grant execute on function public.communication_unsubscribe_by_token(text)
  to service_role;
;
