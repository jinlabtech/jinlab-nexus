
-- JINLAB Nexus Communications
-- Controlled template backend v1

create or replace function public.communication_create_template(
  p_name text,
  p_description text default null,
  p_purpose text default 'transactional',
  p_category text default 'custom',
  p_channel text default 'email',
  p_branch_id uuid default null,
  p_subject_template text default null,
  p_preheader_template text default null,
  p_content_blocks jsonb default '{"blocks":[]}'::jsonb,
  p_rendered_html text default null,
  p_rendered_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
  v_version public.communication_template_version;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('templates.manage') then
    raise exception 'Permission denied';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch b
    where b.id = p_branch_id and b.company_id = v_company_id
  ) then
    raise exception 'Invalid branch';
  end if;

  insert into public.communication_template (
    company_id, branch_id, name, description, purpose, category, channel,
    status, created_by
  )
  values (
    v_company_id, p_branch_id, btrim(p_name), p_description, p_purpose,
    btrim(p_category), p_channel, 'draft', v_user_id
  )
  returning * into v_template;

  insert into public.communication_template_version (
    company_id, template_id, version_no, subject_template, preheader_template,
    content_blocks, rendered_html, rendered_text, status, created_by
  )
  values (
    v_company_id, v_template.id, 1, p_subject_template, p_preheader_template,
    coalesce(p_content_blocks, '{"blocks":[]}'::jsonb),
    p_rendered_html, p_rendered_text, 'draft', v_user_id
  )
  returning * into v_version;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'create', 'communications', v_template.id,
    'Communication template created',
    jsonb_build_object(
      'template_id', v_template.id,
      'version_id', v_version.id,
      'version_no', v_version.version_no,
      'purpose', v_template.purpose,
      'category', v_template.category,
      'channel', v_template.channel
    )
  );

  return jsonb_build_object(
    'ok', true,
    'template_id', v_template.id,
    'version_id', v_version.id,
    'version_no', v_version.version_no
  );
end;
$$;

create or replace function public.communication_save_template_draft(
  p_template_id uuid,
  p_name text default null,
  p_description text default null,
  p_branch_id uuid default null,
  p_subject_template text default null,
  p_preheader_template text default null,
  p_content_blocks jsonb default null,
  p_rendered_html text default null,
  p_rendered_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
  v_draft public.communication_template_version;
  v_next_version integer;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('templates.manage') then
    raise exception 'Permission denied';
  end if;

  select *
  into v_template
  from public.communication_template
  where id = p_template_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template not found';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch b
    where b.id = p_branch_id and b.company_id = v_company_id
  ) then
    raise exception 'Invalid branch';
  end if;

  update public.communication_template
  set
    name = coalesce(nullif(btrim(p_name), ''), name),
    description = coalesce(p_description, description),
    branch_id = coalesce(p_branch_id, branch_id)
  where id = p_template_id
    and company_id = v_company_id
  returning * into v_template;

  select *
  into v_draft
  from public.communication_template_version
  where company_id = v_company_id
    and template_id = p_template_id
    and status = 'draft'
  order by version_no desc
  limit 1
  for update;

  if not found then
    select coalesce(max(version_no), 0) + 1
    into v_next_version
    from public.communication_template_version
    where company_id = v_company_id
      and template_id = p_template_id;

    insert into public.communication_template_version (
      company_id, template_id, version_no, subject_template, preheader_template,
      content_blocks, rendered_html, rendered_text, status, created_by
    )
    select
      v_company_id,
      p_template_id,
      v_next_version,
      coalesce(p_subject_template, pv.subject_template),
      coalesce(p_preheader_template, pv.preheader_template),
      coalesce(p_content_blocks, pv.content_blocks, '{"blocks":[]}'::jsonb),
      coalesce(p_rendered_html, pv.rendered_html),
      coalesce(p_rendered_text, pv.rendered_text),
      'draft',
      v_user_id
    from (
      select *
      from public.communication_template_version
      where company_id = v_company_id
        and template_id = p_template_id
      order by version_no desc
      limit 1
    ) pv
    returning * into v_draft;

    if v_draft.id is null then
      insert into public.communication_template_version (
        company_id, template_id, version_no, subject_template, preheader_template,
        content_blocks, rendered_html, rendered_text, status, created_by
      )
      values (
        v_company_id, p_template_id, v_next_version,
        p_subject_template, p_preheader_template,
        coalesce(p_content_blocks, '{"blocks":[]}'::jsonb),
        p_rendered_html, p_rendered_text, 'draft', v_user_id
      )
      returning * into v_draft;
    end if;
  else
    update public.communication_template_version
    set
      subject_template = coalesce(p_subject_template, subject_template),
      preheader_template = coalesce(p_preheader_template, preheader_template),
      content_blocks = coalesce(p_content_blocks, content_blocks),
      rendered_html = coalesce(p_rendered_html, rendered_html),
      rendered_text = coalesce(p_rendered_text, rendered_text)
    where id = v_draft.id
      and company_id = v_company_id
    returning * into v_draft;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'update', 'communications', p_template_id,
    'Communication template draft saved',
    jsonb_build_object(
      'template_id', p_template_id,
      'version_id', v_draft.id,
      'version_no', v_draft.version_no
    )
  );

  return jsonb_build_object(
    'ok', true,
    'template_id', p_template_id,
    'version_id', v_draft.id,
    'version_no', v_draft.version_no,
    'status', v_draft.status
  );
end;
$$;

create or replace function public.communication_publish_template(
  p_template_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
  v_version public.communication_template_version;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('templates.manage') then
    raise exception 'Permission denied';
  end if;

  select *
  into v_template
  from public.communication_template
  where id = p_template_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template not found';
  end if;

  select *
  into v_version
  from public.communication_template_version
  where id = p_version_id
    and template_id = p_template_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template version not found';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'Only a draft version can be published';
  end if;

  update public.communication_template_version
  set status = 'superseded'
  where company_id = v_company_id
    and template_id = p_template_id
    and status = 'published';

  update public.communication_template_version
  set status = 'published',
      published_at = now()
  where id = p_version_id
    and company_id = v_company_id
  returning * into v_version;

  update public.communication_template
  set status = 'active',
      published_version_id = p_version_id
  where id = p_template_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'publish', 'communications', p_template_id,
    'Communication template published',
    jsonb_build_object(
      'template_id', p_template_id,
      'version_id', p_version_id,
      'version_no', v_version.version_no
    )
  );

  return jsonb_build_object(
    'ok', true,
    'template_id', p_template_id,
    'version_id', p_version_id,
    'version_no', v_version.version_no,
    'status', 'published'
  );
end;
$$;

create or replace function public.communication_archive_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('templates.manage') then
    raise exception 'Permission denied';
  end if;

  update public.communication_template
  set status = 'archived'
  where id = p_template_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Template not found';
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id, v_user_id, 'archive', 'communications', p_template_id,
    'Communication template archived',
    jsonb_build_object('template_id', p_template_id)
  );

  return jsonb_build_object(
    'ok', true,
    'template_id', p_template_id,
    'status', 'archived'
  );
end;
$$;

revoke all on function public.communication_create_template(
  text,text,text,text,text,uuid,text,text,jsonb,text,text
) from public, anon;
revoke all on function public.communication_save_template_draft(
  uuid,text,text,uuid,text,text,jsonb,text,text
) from public, anon;
revoke all on function public.communication_publish_template(uuid,uuid)
  from public, anon;
revoke all on function public.communication_archive_template(uuid)
  from public, anon;

grant execute on function public.communication_create_template(
  text,text,text,text,text,uuid,text,text,jsonb,text,text
) to authenticated;
grant execute on function public.communication_save_template_draft(
  uuid,text,text,uuid,text,text,jsonb,text,text
) to authenticated;
grant execute on function public.communication_publish_template(uuid,uuid)
  to authenticated;
grant execute on function public.communication_archive_template(uuid)
  to authenticated;
;
