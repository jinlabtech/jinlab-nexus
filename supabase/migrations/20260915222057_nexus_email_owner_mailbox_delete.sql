-- Nexus Email — owner/admin safe mailbox deletion.
-- Permanent deletion is allowed only for an empty mailbox.
-- Mailboxes with communication history must be deactivated instead.

create or replace function public.email_delete_account(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role text;
  v_account public.email_account%rowtype;
  v_thread_count bigint;
  v_message_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context required';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Email management permission required';
  end if;

  select lower(coalesce(up.role, ''))
    into v_role
  from public.user_profile up
  where up.user_id = v_user_id
    and up.company_id = v_company_id
  limit 1;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Only a company owner or administrator may permanently delete a mailbox';
  end if;

  select *
    into v_account
  from public.email_account ea
  where ea.id = p_account_id
    and ea.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Mailbox not found';
  end if;

  select count(*)
    into v_thread_count
  from public.email_thread et
  where et.company_id = v_company_id
    and et.account_id = p_account_id;

  select count(*)
    into v_message_count
  from public.email_message em
  where em.company_id = v_company_id
    and em.account_id = p_account_id;

  if v_thread_count > 0 or v_message_count > 0 then
    raise exception
      'Mailbox contains communication history and cannot be permanently deleted. Deactivate it instead.';
  end if;

  -- Access rows are safe to remove because there is no communication history.
  delete from public.email_account_access
  where company_id = v_company_id
    and account_id = p_account_id;

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
    v_company_id,
    v_user_id,
    'delete',
    'email',
    p_account_id,
    'Permanently deleted empty email mailbox',
    jsonb_build_object(
      'email_address', v_account.email_address,
      'display_name', v_account.display_name,
      'account_type', v_account.account_type,
      'department', v_account.department,
      'branch_id', v_account.branch_id,
      'provider', v_account.provider,
      'reason', 'empty_mailbox_owner_delete'
    )
  );

  delete from public.email_account
  where id = p_account_id
    and company_id = v_company_id;

  return jsonb_build_object(
    'deleted', true,
    'account_id', p_account_id,
    'email_address', v_account.email_address
  );
end;
$$;
revoke all on function public.email_delete_account(uuid) from public;
revoke all on function public.email_delete_account(uuid) from anon;
grant execute on function public.email_delete_account(uuid) to authenticated;
comment on function public.email_delete_account(uuid) is
  'Owner/admin-only permanent deletion of an empty Nexus Email mailbox. Mailboxes containing communication history must be deactivated.';
