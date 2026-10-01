
-- JINLAB Nexus Email
-- General bulk email batch foundation v1

create table if not exists public.email_bulk_batch (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  email_account_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  purpose text not null default 'notification'
    check (purpose in ('transactional','notification','marketing','internal')),
  subject text not null check (char_length(btrim(subject)) between 1 and 500),
  html_body text,
  text_body text,
  template_version_id uuid,
  status text not null default 'draft'
    check (status in ('draft','queued','processing','completed','cancelled','failed')),
  scheduled_at timestamptz,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_bulk_batch_company_id_id_key unique (company_id, id),
  constraint email_bulk_batch_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict,
  constraint email_bulk_batch_email_account_fkey
    foreign key (company_id, email_account_id)
    references public.email_account(company_id, id)
    on delete restrict,
  constraint email_bulk_batch_template_version_fkey
    foreign key (company_id, template_version_id)
    references public.communication_template_version(company_id, id)
    on delete restrict
);

create index if not exists email_bulk_batch_company_status_idx
  on public.email_bulk_batch(company_id, status, created_at desc);

create table if not exists public.email_bulk_recipient (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  batch_id uuid not null,
  email_address text not null
    check (char_length(btrim(email_address)) between 3 and 320),
  display_name text,
  source text not null default 'manual'
    check (source in ('manual','csv','customer','hr','import','system')),
  variables jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variables) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','queued','sent','failed','skipped')),
  skip_reason text,
  send_job_id uuid,
  queued_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_bulk_recipient_company_id_id_key unique (company_id, id),
  constraint email_bulk_recipient_batch_fkey
    foreign key (company_id, batch_id)
    references public.email_bulk_batch(company_id, id)
    on delete cascade,
  constraint email_bulk_recipient_send_job_fkey
    foreign key (company_id, send_job_id)
    references public.communication_send_job(company_id, id)
    on delete set null
);

create unique index if not exists email_bulk_recipient_email_uidx
  on public.email_bulk_recipient(company_id, batch_id, lower(email_address));

create index if not exists email_bulk_recipient_status_idx
  on public.email_bulk_recipient(company_id, batch_id, status);

drop trigger if exists email_bulk_batch_set_updated_at
  on public.email_bulk_batch;
create trigger email_bulk_batch_set_updated_at
before update on public.email_bulk_batch
for each row execute function public.set_updated_at();

drop trigger if exists email_bulk_recipient_set_updated_at
  on public.email_bulk_recipient;
create trigger email_bulk_recipient_set_updated_at
before update on public.email_bulk_recipient
for each row execute function public.set_updated_at();

alter table public.email_bulk_batch enable row level security;
alter table public.email_bulk_recipient enable row level security;

drop policy if exists email_bulk_batch_select_policy
  on public.email_bulk_batch;
create policy email_bulk_batch_select_policy
on public.email_bulk_batch
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('email.view')
    or public.current_user_has_permission('email.send')
  )
);

drop policy if exists email_bulk_recipient_select_policy
  on public.email_bulk_recipient;
create policy email_bulk_recipient_select_policy
on public.email_bulk_recipient
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('email.view')
    or public.current_user_has_permission('email.send')
  )
);

revoke all on public.email_bulk_batch from anon;
revoke all on public.email_bulk_recipient from anon;

revoke insert, update, delete on public.email_bulk_batch from authenticated;
revoke insert, update, delete on public.email_bulk_recipient from authenticated;

grant select on public.email_bulk_batch to authenticated;
grant select on public.email_bulk_recipient to authenticated;

create or replace function public.email_create_bulk_batch(
  p_email_account_id uuid,
  p_name text,
  p_subject text,
  p_purpose text default 'notification',
  p_html_body text default null,
  p_text_body text default null,
  p_template_version_id uuid default null,
  p_branch_id uuid default null,
  p_scheduled_at timestamptz default null,
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
  v_batch public.email_bulk_batch;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Permission denied';
  end if;

  if p_purpose = 'marketing'
     and not public.current_user_has_permission('marketing.send') then
    raise exception 'Marketing send permission required';
  end if;

  if not public.email_user_can_access_account(p_email_account_id, 'send') then
    raise exception 'No send access to email account';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branch b
    where b.company_id = v_company_id and b.id = p_branch_id
  ) then
    raise exception 'Invalid branch';
  end if;

  if p_template_version_id is not null and not exists (
    select 1
    from public.communication_template_version tv
    where tv.company_id = v_company_id
      and tv.id = p_template_version_id
      and tv.status = 'published'
  ) then
    raise exception 'Published template version not found';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be a JSON object';
  end if;

  insert into public.email_bulk_batch (
    company_id, branch_id, email_account_id, name, purpose,
    subject, html_body, text_body, template_version_id,
    scheduled_at, settings, created_by
  )
  values (
    v_company_id, p_branch_id, p_email_account_id, btrim(p_name), p_purpose,
    btrim(p_subject), p_html_body, p_text_body, p_template_version_id,
    p_scheduled_at, p_settings, v_user_id
  )
  returning * into v_batch;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'create', 'email', v_batch.id,
    'Bulk email batch created',
    jsonb_build_object(
      'batch_id', v_batch.id,
      'purpose', v_batch.purpose,
      'email_account_id', v_batch.email_account_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch.id,
    'status', v_batch.status
  );
end;
$$;

create or replace function public.email_add_bulk_recipients(
  p_batch_id uuid,
  p_recipients jsonb,
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
  v_batch public.email_bulk_batch;
  v_item jsonb;
  v_email text;
  v_name text;
  v_variables jsonb;
  v_added integer := 0;
  v_updated integer := 0;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Permission denied';
  end if;

  if p_recipients is null or jsonb_typeof(p_recipients) <> 'array' then
    raise exception 'recipients must be a JSON array';
  end if;

  if jsonb_array_length(p_recipients) > 1000 then
    raise exception 'Maximum 1000 recipients per add operation';
  end if;

  select *
  into v_batch
  from public.email_bulk_batch b
  where b.id = p_batch_id
    and b.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Bulk email batch not found';
  end if;

  if v_batch.status <> 'draft' then
    raise exception 'Recipients can only be changed while batch is draft';
  end if;

  if not public.email_user_can_access_account(v_batch.email_account_id, 'send') then
    raise exception 'No send access to email account';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_recipients)
  loop
    v_email := lower(btrim(coalesce(v_item->>'email', '')));
    v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
    v_variables := coalesce(v_item->'variables', '{}'::jsonb);

    if v_email = '' or position('@' in v_email) = 0 then
      continue;
    end if;

    if jsonb_typeof(v_variables) <> 'object' then
      v_variables := '{}'::jsonb;
    end if;

    if exists (
      select 1
      from public.email_bulk_recipient r
      where r.company_id = v_company_id
        and r.batch_id = p_batch_id
        and lower(r.email_address) = v_email
    ) then
      update public.email_bulk_recipient
      set display_name = coalesce(v_name, display_name),
          source = p_source,
          variables = v_variables,
          status = 'pending',
          skip_reason = null
      where company_id = v_company_id
        and batch_id = p_batch_id
        and lower(email_address) = v_email;

      v_updated := v_updated + 1;
    else
      insert into public.email_bulk_recipient (
        company_id, batch_id, email_address, display_name,
        source, variables, status
      )
      values (
        v_company_id, p_batch_id, v_email, v_name,
        p_source, v_variables, 'pending'
      );

      v_added := v_added + 1;
    end if;
  end loop;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'recipient_update', 'email', p_batch_id,
    'Bulk email recipients updated',
    jsonb_build_object(
      'batch_id', p_batch_id,
      'added_count', v_added,
      'updated_count', v_updated,
      'source', p_source
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'added_count', v_added,
    'updated_count', v_updated
  );
end;
$$;

create or replace function public.email_queue_bulk_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_batch public.email_bulk_batch;
  v_template public.communication_template_version;
  v_rec record;
  v_job_id uuid;
  v_idempotency_key text;
  v_queued integer := 0;
  v_existing integer := 0;
  v_skipped integer := 0;
  v_schedule timestamptz;
  v_subject text;
  v_html text;
  v_text text;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Permission denied';
  end if;

  select *
  into v_batch
  from public.email_bulk_batch b
  where b.id = p_batch_id
    and b.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Bulk email batch not found';
  end if;

  if v_batch.status <> 'draft' then
    raise exception 'Bulk email batch is not in draft status';
  end if;

  if v_batch.purpose = 'marketing'
     and not public.current_user_has_permission('marketing.send') then
    raise exception 'Marketing send permission required';
  end if;

  if not public.email_user_can_access_account(v_batch.email_account_id, 'send') then
    raise exception 'No send access to email account';
  end if;

  if v_batch.template_version_id is not null then
    select *
    into v_template
    from public.communication_template_version tv
    where tv.company_id = v_company_id
      and tv.id = v_batch.template_version_id
      and tv.status = 'published';

    if not found then
      raise exception 'Published template version not found';
    end if;
  end if;

  v_schedule := coalesce(v_batch.scheduled_at, now());
  v_subject := coalesce(v_batch.subject, v_template.subject_template);
  v_html := coalesce(v_batch.html_body, v_template.rendered_html);
  v_text := coalesce(v_batch.text_body, v_template.rendered_text);

  if coalesce(nullif(btrim(v_html), ''), nullif(btrim(v_text), '')) is null then
    raise exception 'Bulk email body is required';
  end if;

  for v_rec in
    select r.*
    from public.email_bulk_recipient r
    where r.company_id = v_company_id
      and r.batch_id = p_batch_id
      and r.status = 'pending'
    order by r.created_at, r.id
    for update
  loop
    -- Suppression scope "all" blocks every bulk message purpose.
    if exists (
      select 1
      from public.communication_suppression s
      where s.company_id = v_company_id
        and s.channel = 'email'
        and s.active = true
        and s.scope = 'all'
        and lower(s.address) = lower(v_rec.email_address)
    ) then
      update public.email_bulk_recipient
      set status = 'skipped',
          skip_reason = 'Recipient is globally suppressed'
      where id = v_rec.id
        and company_id = v_company_id;

      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Marketing additionally requires consent and respects marketing suppression.
    if v_batch.purpose = 'marketing' then
      if not exists (
        select 1
        from public.communication_consent c
        where c.company_id = v_company_id
          and c.channel = 'email'
          and c.purpose = 'marketing'
          and c.status = 'granted'
          and lower(c.address) = lower(v_rec.email_address)
      ) then
        update public.email_bulk_recipient
        set status = 'skipped',
            skip_reason = 'Marketing consent is not granted'
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
        update public.email_bulk_recipient
        set status = 'skipped',
            skip_reason = 'Recipient is suppressed for marketing'
        where id = v_rec.id
          and company_id = v_company_id;

        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    v_idempotency_key :=
      'bulk-email:' || p_batch_id::text || ':recipient:' || v_rec.id::text;

    select j.id
    into v_job_id
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.idempotency_key = v_idempotency_key
    limit 1;

    if v_job_id is not null then
      update public.email_bulk_recipient
      set status = 'queued',
          send_job_id = v_job_id,
          queued_at = coalesce(queued_at, now()),
          skip_reason = null
      where id = v_rec.id
        and company_id = v_company_id;

      v_existing := v_existing + 1;
      v_job_id := null;
      continue;
    end if;

    insert into public.communication_send_job (
      company_id, branch_id, channel, purpose,
      source_type, source_id, email_account_id,
      template_version_id, recipient_address,
      recipient_display_name, subject,
      rendered_html, rendered_text, variables,
      idempotency_key, status, priority,
      scheduled_at, created_by
    )
    values (
      v_company_id, v_batch.branch_id, 'email', v_batch.purpose,
      'email_bulk_batch', p_batch_id, v_batch.email_account_id,
      v_batch.template_version_id, lower(btrim(v_rec.email_address)),
      v_rec.display_name, v_subject,
      v_html, v_text,
      coalesce(v_rec.variables, '{}'::jsonb) ||
        jsonb_build_object(
          'bulk_batch_id', p_batch_id,
          'bulk_recipient_id', v_rec.id
        ),
      v_idempotency_key, 'queued', 100,
      v_schedule, v_user_id
    )
    returning id into v_job_id;

    update public.email_bulk_recipient
    set status = 'queued',
        send_job_id = v_job_id,
        queued_at = now(),
        skip_reason = null
    where id = v_rec.id
      and company_id = v_company_id;

    v_queued := v_queued + 1;
    v_job_id := null;
  end loop;

  update public.email_bulk_batch
  set status = 'queued'
  where id = p_batch_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'queue', 'email', p_batch_id,
    'Bulk email batch queued',
    jsonb_build_object(
      'batch_id', p_batch_id,
      'queued_count', v_queued,
      'existing_job_count', v_existing,
      'skipped_count', v_skipped,
      'scheduled_at', v_schedule
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'queued_count', v_queued,
    'existing_job_count', v_existing,
    'skipped_count', v_skipped,
    'scheduled_at', v_schedule
  );
end;
$$;

revoke all on function public.email_create_bulk_batch(
  uuid,text,text,text,text,text,uuid,uuid,timestamptz,jsonb
) from public, anon;
revoke all on function public.email_add_bulk_recipients(uuid,jsonb,text)
  from public, anon;
revoke all on function public.email_queue_bulk_batch(uuid)
  from public, anon;

grant execute on function public.email_create_bulk_batch(
  uuid,text,text,text,text,text,uuid,uuid,timestamptz,jsonb
) to authenticated;
grant execute on function public.email_add_bulk_recipients(uuid,jsonb,text)
  to authenticated;
grant execute on function public.email_queue_bulk_batch(uuid)
  to authenticated;
;
