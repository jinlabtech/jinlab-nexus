-- ============================================================
-- JINLAB NEXUS
-- Sprint 18.15B
-- Secure completion / failure handling for company exports
-- ============================================================


create or replace function public.complete_company_export(
  p_export_job_id uuid,
  p_file_size_bytes bigint,
  p_checksum_sha256 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_export_type text;
begin
  v_company_id :=
    public.current_settings_company_id();

  if v_company_id is null then
    raise exception
      'No company is assigned to the current user.';
  end if;


  select export_type
  into v_export_type
  from public.company_export_job
  where id = p_export_job_id
    and company_id = v_company_id
    and status in (
      'requested',
      'processing'
    );


  if v_export_type is null then
    raise exception
      'Active export job not found.';
  end if;


  if v_export_type = 'business_data' then

    if not public.current_user_has_permission(
      'data.export'
    ) then
      raise exception
        'Permission denied: data.export';
    end if;

  else

    if not public.current_user_has_permission(
      'data.backup'
    ) then
      raise exception
        'Permission denied: data.backup';
    end if;

  end if;


  update public.company_export_job
  set
    status = 'completed',
    started_at =
      coalesce(started_at, now()),
    completed_at = now(),
    file_size_bytes =
      greatest(
        coalesce(
          p_file_size_bytes,
          0
        ),
        0
      ),
    checksum_sha256 =
      nullif(
        trim(
          coalesce(
            p_checksum_sha256,
            ''
          )
        ),
        ''
      ),
    expires_at =
      now() + interval '24 hours',
    error_message = null
  where id = p_export_job_id
    and company_id = v_company_id;


  perform public.log_settings_change(
    v_company_id,
    'data_portability',
    'export_completed',
    jsonb_build_object(
      'export_job_id',
      p_export_job_id,
      'file_size_bytes',
      p_file_size_bytes,
      'checksum_sha256',
      p_checksum_sha256
    )
  );
end;
$$;


create or replace function public.fail_company_export(
  p_export_job_id uuid,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_export_type text;
begin
  v_company_id :=
    public.current_settings_company_id();

  if v_company_id is null then
    raise exception
      'No company is assigned to the current user.';
  end if;


  select export_type
  into v_export_type
  from public.company_export_job
  where id = p_export_job_id
    and company_id = v_company_id;


  if v_export_type is null then
    raise exception
      'Export job not found.';
  end if;


  if v_export_type = 'business_data' then

    if not public.current_user_has_permission(
      'data.export'
    ) then
      raise exception
        'Permission denied: data.export';
    end if;

  else

    if not public.current_user_has_permission(
      'data.backup'
    ) then
      raise exception
        'Permission denied: data.backup';
    end if;

  end if;


  update public.company_export_job
  set
    status = 'failed',
    started_at =
      coalesce(started_at, now()),
    completed_at = now(),
    error_message =
      left(
        coalesce(
          p_error_message,
          'Export failed.'
        ),
        2000
      )
  where id = p_export_job_id
    and company_id = v_company_id;


  perform public.log_settings_change(
    v_company_id,
    'data_portability',
    'export_failed',
    jsonb_build_object(
      'export_job_id',
      p_export_job_id,
      'error',
      left(
        coalesce(
          p_error_message,
          'Export failed.'
        ),
        500
      )
    )
  );
end;
$$;


revoke all on function
public.complete_company_export(
  uuid,
  bigint,
  text
)
from public;


revoke all on function
public.fail_company_export(
  uuid,
  text
)
from public;


grant execute on function
public.complete_company_export(
  uuid,
  bigint,
  text
)
to authenticated;


grant execute on function
public.fail_company_export(
  uuid,
  text
)
to authenticated;
