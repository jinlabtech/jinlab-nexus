
-- JINLAB Nexus Communications
-- Marketing controlled workflow v1

create or replace function public.marketing_create_audience(
  p_name text,
  p_description text default null,
  p_branch_id uuid default null,
  p_audience_type text default 'static',
  p_filter_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_audience public.marketing_audience;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
    raise exception 'Permission denied';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch b
    where b.company_id = v_company_id and b.id = p_branch_id
  ) then
    raise exception 'Invalid branch';
  end if;

  if p_filter_config is null or jsonb_typeof(p_filter_config) <> 'object' then
    raise exception 'filter_config must be a JSON object';
  end if;

  insert into public.marketing_audience (
    company_id, branch_id, name, description, audience_type,
    filter_config, status, created_by
  )
  values (
    v_company_id, p_branch_id, btrim(p_name), p_description,
    p_audience_type, p_filter_config, 'active', v_user_id
  )
  returning * into v_audience;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'create', 'marketing', v_audience.id,
    'Marketing audience created',
    jsonb_build_object(
      'audience_id', v_audience.id,
      'audience_type', v_audience.audience_type,
      'branch_id', v_audience.branch_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'audience_id', v_audience.id,
    'status', v_audience.status
  );
end;
$$;

create or replace function public.marketing_add_audience_member(
  p_audience_id uuid,
  p_customer_id uuid default null,
  p_email_address text default null,
  p_display_name text default null,
  p_variables jsonb default '{}'::jsonb,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_customer_email text;
  v_customer_name text;
  v_email text;
  v_name text;
  v_member public.marketing_audience_member;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1 from public.marketing_audience a
    where a.id = p_audience_id
      and a.company_id = v_company_id
      and a.status = 'active'
  ) then
    raise exception 'Audience not found or inactive';
  end if;

  if p_variables is null or jsonb_typeof(p_variables) <> 'object' then
    raise exception 'variables must be a JSON object';
  end if;

  if p_customer_id is not null then
    select c.email, c.customer_name
      into v_customer_email, v_customer_name
    from public.customer c
    where c.id = p_customer_id
      and c.company_id = v_company_id;

    if not found then
      raise exception 'Customer not found';
    end if;
  end if;

  v_email := lower(btrim(coalesce(nullif(p_email_address, ''), v_customer_email, '')));
  v_name := coalesce(nullif(btrim(p_display_name), ''), v_customer_name);

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Valid email address required';
  end if;

  select *
    into v_member
  from public.marketing_audience_member m
  where m.company_id = v_company_id
    and m.audience_id = p_audience_id
    and lower(m.email_address) = v_email
  limit 1
  for update;

  if found then
    update public.marketing_audience_member
    set customer_id = coalesce(p_customer_id, customer_id),
        display_name = coalesce(v_name, display_name),
        member_status = 'active',
        source = p_source,
        variables = p_variables
    where id = v_member.id
      and company_id = v_company_id
    returning * into v_member;
  else
    insert into public.marketing_audience_member (
      company_id, audience_id, customer_id, email_address,
      display_name, member_status, source, variables, created_by
    )
    values (
      v_company_id, p_audience_id, p_customer_id, v_email,
      v_name, 'active', p_source, p_variables, v_user_id
    )
    returning * into v_member;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'audience_member_saved', 'marketing', v_member.id,
    'Marketing audience member saved',
    jsonb_build_object(
      'audience_id', p_audience_id,
      'member_id', v_member.id,
      'customer_id', v_member.customer_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member.id,
    'audience_id', p_audience_id
  );
end;
$$;

create or replace function public.marketing_set_email_consent(
  p_email_address text,
  p_status text,
  p_customer_id uuid default null,
  p_source text default 'manual',
  p_legal_basis text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_email text := lower(btrim(coalesce(p_email_address, '')));
  v_consent public.communication_consent;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
    raise exception 'Permission denied';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Valid email address required';
  end if;

  if p_status not in ('granted','denied','withdrawn','pending') then
    raise exception 'Invalid consent status';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customer c
    where c.id = p_customer_id and c.company_id = v_company_id
  ) then
    raise exception 'Customer not found';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'evidence must be a JSON object';
  end if;

  select *
    into v_consent
  from public.communication_consent c
  where c.company_id = v_company_id
    and c.channel = 'email'
    and lower(c.address) = v_email
    and c.purpose = 'marketing'
  limit 1
  for update;

  if found then
    update public.communication_consent
    set customer_id = coalesce(p_customer_id, customer_id),
        status = p_status,
        source = p_source,
        legal_basis = p_legal_basis,
        consented_at = case when p_status = 'granted' then now() else consented_at end,
        withdrawn_at = case when p_status = 'withdrawn' then now() else null end,
        evidence = p_evidence
    where id = v_consent.id
      and company_id = v_company_id
    returning * into v_consent;
  else
    insert into public.communication_consent (
      company_id, customer_id, channel, address, purpose,
      status, source, legal_basis, consented_at, withdrawn_at,
      evidence, created_by
    )
    values (
      v_company_id, p_customer_id, 'email', v_email, 'marketing',
      p_status, p_source, p_legal_basis,
      case when p_status = 'granted' then now() else null end,
      case when p_status = 'withdrawn' then now() else null end,
      p_evidence, v_user_id
    )
    returning * into v_consent;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'consent_update', 'marketing', v_consent.id,
    'Marketing email consent updated',
    jsonb_build_object(
      'consent_id', v_consent.id,
      'status', v_consent.status,
      'customer_id', v_consent.customer_id,
      'source', v_consent.source
    )
  );

  return jsonb_build_object(
    'ok', true,
    'consent_id', v_consent.id,
    'status', v_consent.status
  );
end;
$$;

create or replace function public.marketing_create_campaign(
  p_name text,
  p_email_account_id uuid,
  p_template_id uuid,
  p_template_version_id uuid,
  p_audience_id uuid,
  p_description text default null,
  p_branch_id uuid default null,
  p_subject_override text default null,
  p_preheader_override text default null,
  p_scheduled_at timestamptz default null,
  p_timezone text default 'UTC',
  p_requires_approval boolean default false,
  p_track_opens boolean default true,
  p_track_clicks boolean default true,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_campaign public.email_campaign;
  v_template public.communication_template;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
    raise exception 'Permission denied';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch b
    where b.company_id = v_company_id and b.id = p_branch_id
  ) then
    raise exception 'Invalid branch';
  end if;

  if not exists (
    select 1 from public.email_account ea
    where ea.company_id = v_company_id
      and ea.id = p_email_account_id
      and ea.active = true
  ) then
    raise exception 'Active email account not found';
  end if;

  if not public.email_user_can_access_account(p_email_account_id, 'send') then
    raise exception 'No send access to email account';
  end if;

  select *
    into v_template
  from public.communication_template t
  where t.company_id = v_company_id
    and t.id = p_template_id
    and t.channel = 'email'
    and t.purpose = 'marketing'
    and t.status = 'active';

  if not found then
    raise exception 'Active marketing email template not found';
  end if;

  if v_template.published_version_id is distinct from p_template_version_id then
    raise exception 'Campaign must use the currently published template version';
  end if;

  if not exists (
    select 1 from public.communication_template_version tv
    where tv.company_id = v_company_id
      and tv.id = p_template_version_id
      and tv.template_id = p_template_id
      and tv.status = 'published'
  ) then
    raise exception 'Published template version not found';
  end if;

  if not exists (
    select 1 from public.marketing_audience a
    where a.company_id = v_company_id
      and a.id = p_audience_id
      and a.status = 'active'
  ) then
    raise exception 'Active audience not found';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be a JSON object';
  end if;

  insert into public.email_campaign (
    company_id, branch_id, name, description,
    email_account_id, template_id, template_version_id, audience_id,
    status, subject_override, preheader_override, scheduled_at, timezone,
    requires_approval, track_opens, track_clicks, settings, created_by
  )
  values (
    v_company_id, p_branch_id, btrim(p_name), p_description,
    p_email_account_id, p_template_id, p_template_version_id, p_audience_id,
    'draft', p_subject_override, p_preheader_override, p_scheduled_at,
    coalesce(nullif(btrim(p_timezone), ''), 'UTC'),
    p_requires_approval, p_track_opens, p_track_clicks, p_settings, v_user_id
  )
  returning * into v_campaign;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'create', 'marketing', v_campaign.id,
    'Email marketing campaign created',
    jsonb_build_object(
      'campaign_id', v_campaign.id,
      'audience_id', v_campaign.audience_id,
      'template_id', v_campaign.template_id,
      'template_version_id', v_campaign.template_version_id,
      'email_account_id', v_campaign.email_account_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign.id,
    'status', v_campaign.status
  );
end;
$$;

create or replace function public.marketing_prepare_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_campaign public.email_campaign;
  v_total integer := 0;
  v_eligible integer := 0;
  v_skipped integer := 0;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.send') then
    raise exception 'Permission denied';
  end if;

  select *
    into v_campaign
  from public.email_campaign c
  where c.id = p_campaign_id
    and c.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if v_campaign.status not in ('draft','ready') then
    raise exception 'Campaign cannot be prepared from current status';
  end if;

  if not public.email_user_can_access_account(v_campaign.email_account_id, 'send') then
    raise exception 'No send access to campaign email account';
  end if;

  delete from public.email_campaign_recipient
  where company_id = v_company_id
    and campaign_id = p_campaign_id;

  insert into public.email_campaign_recipient (
    company_id, campaign_id, customer_id, email_address, display_name,
    variables, consent_status, suppression_reason, send_status
  )
  select
    v_company_id,
    p_campaign_id,
    m.customer_id,
    lower(btrim(m.email_address)),
    m.display_name,
    m.variables,
    coalesce(cons.status, 'unknown'),
    supp.reason,
    case
      when supp.id is not null then 'skipped'
      when cons.status = 'granted' then 'pending'
      else 'skipped'
    end
  from public.marketing_audience_member m
  left join lateral (
    select c.id, c.status
    from public.communication_consent c
    where c.company_id = v_company_id
      and c.channel = 'email'
      and c.purpose = 'marketing'
      and lower(c.address) = lower(m.email_address)
    limit 1
  ) cons on true
  left join lateral (
    select s.id, s.reason
    from public.communication_suppression s
    where s.company_id = v_company_id
      and s.channel = 'email'
      and s.active = true
      and s.scope in ('marketing','all')
      and lower(s.address) = lower(m.email_address)
    order by s.created_at desc
    limit 1
  ) supp on true
  where m.company_id = v_company_id
    and m.audience_id = v_campaign.audience_id
    and m.member_status = 'active';

  select count(*),
         count(*) filter (where send_status = 'pending'),
         count(*) filter (where send_status = 'skipped')
    into v_total, v_eligible, v_skipped
  from public.email_campaign_recipient
  where company_id = v_company_id
    and campaign_id = p_campaign_id;

  update public.email_campaign
  set status = 'ready'
  where id = p_campaign_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'prepare', 'marketing', p_campaign_id,
    'Email marketing campaign recipients prepared',
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'recipient_count', v_total,
      'eligible_count', v_eligible,
      'skipped_count', v_skipped,
      'consent_policy', 'explicit_grant_required'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'status', 'ready',
    'recipient_count', v_total,
    'eligible_count', v_eligible,
    'skipped_count', v_skipped,
    'consent_policy', 'explicit_grant_required'
  );
end;
$$;

revoke all on function public.marketing_create_audience(text,text,uuid,text,jsonb)
  from public, anon;
revoke all on function public.marketing_add_audience_member(uuid,uuid,text,text,jsonb,text)
  from public, anon;
revoke all on function public.marketing_set_email_consent(text,text,uuid,text,text,jsonb)
  from public, anon;
revoke all on function public.marketing_create_campaign(
  text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,text,boolean,boolean,boolean,jsonb
) from public, anon;
revoke all on function public.marketing_prepare_campaign(uuid)
  from public, anon;

grant execute on function public.marketing_create_audience(text,text,uuid,text,jsonb)
  to authenticated;
grant execute on function public.marketing_add_audience_member(uuid,uuid,text,text,jsonb,text)
  to authenticated;
grant execute on function public.marketing_set_email_consent(text,text,uuid,text,text,jsonb)
  to authenticated;
grant execute on function public.marketing_create_campaign(
  text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,text,boolean,boolean,boolean,jsonb
) to authenticated;
grant execute on function public.marketing_prepare_campaign(uuid)
  to authenticated;
;
