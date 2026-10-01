
create or replace function public.marketing_approve_campaign(
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
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('marketing.manage') then
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
    raise exception 'Campaign cannot be approved from current status';
  end if;

  update public.email_campaign
  set approved_by = v_user_id,
      approved_at = now()
  where id = p_campaign_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'approve', 'marketing', p_campaign_id,
    'Email marketing campaign approved',
    jsonb_build_object('campaign_id', p_campaign_id)
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'approved_at', now()
  );
end;
$$;

create or replace function public.marketing_queue_campaign(
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
  v_template_version public.communication_template_version;
  v_rec record;
  v_job_id uuid;
  v_queued integer := 0;
  v_skipped integer := 0;
  v_existing integer := 0;
  v_idempotency_key text;
  v_scheduled_at timestamptz;
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

  if v_campaign.status <> 'ready' then
    raise exception 'Campaign must be prepared and ready before queueing';
  end if;

  if v_campaign.requires_approval and v_campaign.approved_at is null then
    raise exception 'Campaign approval is required before queueing';
  end if;

  if not public.email_user_can_access_account(v_campaign.email_account_id, 'send') then
    raise exception 'No send access to campaign email account';
  end if;

  select *
  into v_template_version
  from public.communication_template_version tv
  where tv.id = v_campaign.template_version_id
    and tv.company_id = v_company_id
    and tv.template_id = v_campaign.template_id
    and tv.status = 'published';

  if not found then
    raise exception 'Published campaign template version not found';
  end if;

  v_scheduled_at := coalesce(v_campaign.scheduled_at, now());

  for v_rec in
    select r.*
    from public.email_campaign_recipient r
    where r.company_id = v_company_id
      and r.campaign_id = p_campaign_id
      and r.send_status in ('pending','queued')
    order by r.created_at, r.id
    for update
  loop
    if not exists (
      select 1
      from public.communication_consent c
      where c.company_id = v_company_id
        and c.channel = 'email'
        and c.purpose = 'marketing'
        and lower(c.address) = lower(v_rec.email_address)
        and c.status = 'granted'
    ) then
      update public.email_campaign_recipient
      set send_status = 'skipped',
          consent_status = coalesce((
            select c.status
            from public.communication_consent c
            where c.company_id = v_company_id
              and c.channel = 'email'
              and c.purpose = 'marketing'
              and lower(c.address) = lower(v_rec.email_address)
            order by c.updated_at desc
            limit 1
          ), 'unknown'),
          suppression_reason = null,
          last_error = 'Marketing consent is not granted'
      where id = v_rec.id
        and company_id = v_company_id;

      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.communication_suppression s
      where s.company_id = v_company_id
        and s.channel = 'email'
        and s.active = true
        and s.scope in ('marketing','all')
        and lower(s.address) = lower(v_rec.email_address)
    ) then
      update public.email_campaign_recipient
      set send_status = 'skipped',
          consent_status = 'granted',
          suppression_reason = (
            select s.reason
            from public.communication_suppression s
            where s.company_id = v_company_id
              and s.channel = 'email'
              and s.active = true
              and s.scope in ('marketing','all')
              and lower(s.address) = lower(v_rec.email_address)
            order by s.created_at desc
            limit 1
          ),
          last_error = 'Recipient is suppressed'
      where id = v_rec.id
        and company_id = v_company_id;

      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_idempotency_key :=
      'marketing:' || p_campaign_id::text || ':recipient:' || v_rec.id::text;

    select j.id
    into v_job_id
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.idempotency_key = v_idempotency_key
    limit 1;

    if v_job_id is not null then
      update public.email_campaign_recipient
      set send_status = 'queued',
          consent_status = 'granted',
          suppression_reason = null,
          queued_at = coalesce(queued_at, now()),
          last_error = null
      where id = v_rec.id
        and company_id = v_company_id;

      v_existing := v_existing + 1;
      v_job_id := null;
      continue;
    end if;

    insert into public.communication_send_job (
      company_id,
      branch_id,
      channel,
      purpose,
      source_type,
      source_id,
      email_account_id,
      template_version_id,
      recipient_address,
      recipient_display_name,
      subject,
      rendered_html,
      rendered_text,
      variables,
      idempotency_key,
      status,
      priority,
      scheduled_at,
      provider,
      created_by
    )
    values (
      v_company_id,
      v_campaign.branch_id,
      'email',
      'marketing',
      'email_campaign',
      p_campaign_id,
      v_campaign.email_account_id,
      v_campaign.template_version_id,
      lower(btrim(v_rec.email_address)),
      v_rec.display_name,
      coalesce(v_campaign.subject_override, v_template_version.subject_template),
      v_template_version.rendered_html,
      v_template_version.rendered_text,
      coalesce(v_rec.variables, '{}'::jsonb) ||
        jsonb_build_object(
          'campaign_id', p_campaign_id,
          'campaign_recipient_id', v_rec.id,
          'preheader', coalesce(v_campaign.preheader_override, v_template_version.preheader_template)
        ),
      v_idempotency_key,
      'queued',
      100,
      v_scheduled_at,
      null,
      v_user_id
    )
    returning id into v_job_id;

    update public.email_campaign_recipient
    set send_status = 'queued',
        consent_status = 'granted',
        suppression_reason = null,
        queued_at = now(),
        last_error = null
    where id = v_rec.id
      and company_id = v_company_id;

    v_queued := v_queued + 1;
    v_job_id := null;
  end loop;

  update public.email_campaign
  set status = case
    when v_scheduled_at > now() then 'scheduled'
    else 'processing'
  end
  where id = p_campaign_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'queue', 'marketing', p_campaign_id,
    'Email marketing campaign queued',
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'queued_count', v_queued,
      'existing_job_count', v_existing,
      'skipped_count', v_skipped,
      'scheduled_at', v_scheduled_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'campaign_status', case
      when v_scheduled_at > now() then 'scheduled'
      else 'processing'
    end,
    'queued_count', v_queued,
    'existing_job_count', v_existing,
    'skipped_count', v_skipped,
    'scheduled_at', v_scheduled_at
  );
end;
$$;

revoke all on function public.marketing_approve_campaign(uuid) from public, anon;
revoke all on function public.marketing_queue_campaign(uuid) from public, anon;

grant execute on function public.marketing_approve_campaign(uuid) to authenticated;
grant execute on function public.marketing_queue_campaign(uuid) to authenticated;
;
