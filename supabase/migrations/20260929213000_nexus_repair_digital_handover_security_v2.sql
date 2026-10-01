-- ============================================================
-- JINLAB NEXUS
-- Repair Digital Handover Security V2
--
-- 1. Signature recording becomes server-only.
-- 2. Signature storage object must actually exist.
-- 3. Re-signing invalidates outstanding OTP challenges.
-- 4. Handover finalisation requires a VERIFIED OTP database row.
-- ============================================================


-- ============================================================
-- 1. DISABLE DIRECT CLIENT SIGNATURE RPC
-- ============================================================

revoke all
on function public.repair_record_handover_signature(
  uuid,
  text,
  text
)
from public, anon, authenticated, service_role;


-- ============================================================
-- 2. SERVER-ONLY SIGNATURE RECORDING
-- ============================================================

create or replace function
public.repair_record_handover_signature_server(
  p_handover_id uuid,
  p_actor_user_id uuid,
  p_signature_storage_path text,
  p_signature_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_handover public.repair_handover%rowtype;
  v_expected_prefix text;
begin

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Server authorization required.';
  end if;


  if p_actor_user_id is null then
    raise exception
      'Nexus user reference is required.';
  end if;


  if nullif(
    btrim(
      coalesce(
        p_signature_storage_path,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'Signature storage path is required.';
  end if;


  if p_signature_sha256 is null
     or p_signature_sha256
        !~ '^[a-fA-F0-9]{64}$'
  then
    raise exception
      'A valid SHA-256 signature digest is required.';
  end if;


  select *
  into v_handover
  from public.repair_handover
  where id = p_handover_id
  for update;


  if not found then
    raise exception
      'Repair handover could not be found.';
  end if;


  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_actor_user_id
      and up.company_id = v_handover.company_id
  ) then
    raise exception
      'Nexus user does not belong to this company.';
  end if;


  if v_handover.handover_type <> 'intake' then
    raise exception
      'This handover is not an intake handover.';
  end if;


  if v_handover.status = 'verified' then
    return jsonb_build_object(
      'ok',
        true,
      'handover_id',
        v_handover.id,
      'status',
        v_handover.status,
      'already_verified',
        true
    );
  end if;


  if v_handover.status not in (
    'draft',
    'awaiting_signature',
    'awaiting_otp'
  ) then
    raise exception
      'This handover cannot accept a signature.';
  end if;


  v_expected_prefix :=
    v_handover.company_id::text
    || '/'
    || v_handover.id::text
    || '/';


  if btrim(p_signature_storage_path)
     not like v_expected_prefix || '%'
  then
    raise exception
      'Signature storage path is invalid.';
  end if;


  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'repair-signatures'
      and so.name =
        btrim(p_signature_storage_path)
  ) then
    raise exception
      'Signature file does not exist in secure storage.';
  end if;


  -- A new signature invalidates any previous unverified OTP.
  update public.repair_handover_otp
  set
    status = 'expired',
    updated_at = now()
  where company_id = v_handover.company_id
    and handover_id = v_handover.id
    and status = 'pending';


  update public.repair_handover
  set
    signature_storage_path =
      btrim(p_signature_storage_path),

    signature_sha256 =
      lower(p_signature_sha256),

    terms_accepted_at =
      coalesce(
        terms_accepted_at,
        now()
      ),

    signed_at =
      now(),

    status =
      'awaiting_otp',

    updated_at =
      now()

  where id =
    v_handover.id

  returning *
  into v_handover;


  insert into public.service_job_event (
    company_id,
    service_job_id,
    event_type,
    description,
    metadata,
    user_id
  )
  values (
    v_handover.company_id,
    v_handover.service_job_id,
    'digital_handover_signed',
    'Customer signed the repair intake handover terms.',
    jsonb_build_object(
      'handover_id',
        v_handover.id,
      'terms_version',
        v_handover.terms_version,
      'signature_sha256',
        v_handover.signature_sha256
    ),
    p_actor_user_id
  );


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
    v_handover.company_id,
    p_actor_user_id,
    'repair_handover_signed',
    'repairs',
    v_handover.service_job_id,
    'Customer signed the digital repair intake handover.',
    jsonb_build_object(
      'handover_id',
        v_handover.id,
      'terms_version',
        v_handover.terms_version,
      'signature_sha256',
        v_handover.signature_sha256
    )
  );


  return jsonb_build_object(
    'ok',
      true,
    'handover_id',
      v_handover.id,
    'status',
      v_handover.status,
    'signed_at',
      v_handover.signed_at
  );

end;
$$;


revoke all
on function
public.repair_record_handover_signature_server(
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function
public.repair_record_handover_signature_server(
  uuid,
  uuid,
  text,
  text
)
to service_role;


-- ============================================================
-- 3. HARDEN FINAL VERIFICATION
--
-- p_reference must now be the UUID of the exact verified
-- repair_handover_otp record.
-- ============================================================

create or replace function
public.repair_finalize_verified_handover(
  p_handover_id uuid,
  p_verified_by uuid,
  p_channel text,
  p_reference text,
  p_destination_masked text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_handover public.repair_handover%rowtype;
  v_job public.service_job%rowtype;
  v_otp public.repair_handover_otp%rowtype;
  v_otp_id uuid;
  v_masked text;
begin

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Server authorization required.';
  end if;


  if p_channel not in (
    'sms',
    'whatsapp',
    'email'
  ) then
    raise exception
      'Invalid OTP verification channel.';
  end if;


  if coalesce(p_reference, '')
     !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception
      'Valid OTP verification reference is required.';
  end if;


  v_otp_id :=
    p_reference::uuid;


  select *
  into v_handover
  from public.repair_handover
  where id = p_handover_id
  for update;


  if not found then
    raise exception
      'Repair handover could not be found.';
  end if;


  if v_handover.status = 'verified' then
    return jsonb_build_object(
      'ok',
        true,
      'handover_id',
        v_handover.id,
      'job_number',
        v_handover.job_number_snapshot,
      'receipt_number',
        v_handover.receipt_number,
      'already_verified',
        true
    );
  end if;


  if v_handover.status <> 'awaiting_otp' then
    raise exception
      'The handover is not awaiting OTP verification.';
  end if;


  if v_handover.signature_storage_path is null
     or v_handover.signature_sha256 is null
     or v_handover.signed_at is null
     or v_handover.terms_accepted_at is null
  then
    raise exception
      'Signed handover terms are required before OTP verification.';
  end if;


  select *
  into v_otp
  from public.repair_handover_otp
  where id = v_otp_id
    and company_id =
      v_handover.company_id
    and handover_id =
      v_handover.id
  for update;


  if not found then
    raise exception
      'OTP verification record could not be found.';
  end if;


  if v_otp.status <> 'verified'
     or v_otp.verified_at is null
  then
    raise exception
      'OTP has not been verified.';
  end if;


  if v_otp.channel <> p_channel then
    raise exception
      'OTP channel does not match verification request.';
  end if;


  if v_otp.verified_at > v_otp.expires_at then
    raise exception
      'OTP was verified after its expiry time.';
  end if;


  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_verified_by
      and up.company_id =
        v_handover.company_id
  ) then
    raise exception
      'Verifying Nexus user does not belong to this company.';
  end if;


  if v_otp.channel = 'email'
     and position('@' in v_otp.destination) > 1
  then
    v_masked :=
      left(
        split_part(
          v_otp.destination,
          '@',
          1
        ),
        2
      )
      || '***@'
      || split_part(
        v_otp.destination,
        '@',
        2
      );
  else
    v_masked :=
      '***'
      || right(
        v_otp.destination,
        4
      );
  end if;


  select *
  into v_job
  from public.service_job
  where id =
      v_handover.service_job_id
    and company_id =
      v_handover.company_id
  for update;


  if not found then
    raise exception
      'Repair Job Card could not be found.';
  end if;


  if v_job.status in (
    'closed',
    'cancelled',
    'collected'
  ) then
    raise exception
      'This Job Card cannot be intake-confirmed.';
  end if;


  update public.repair_handover
  set
    status =
      'verified',

    verification_channel =
      v_otp.channel,

    verification_destination_masked =
      v_masked,

    otp_verified_at =
      v_otp.verified_at,

    verified_at =
      now(),

    verified_by =
      p_verified_by,

    receipt_issued_at =
      coalesce(
        receipt_issued_at,
        now()
      ),

    updated_at =
      now()

  where id =
    p_handover_id

  returning *
  into v_handover;


  update public.repair_handover_otp
  set
    status =
      'expired',
    updated_at =
      now()
  where company_id =
      v_handover.company_id
    and handover_id =
      v_handover.id
    and id <>
      v_otp.id
    and status =
      'pending';


  update public.service_job
  set
    intake_confirmed_at =
      now(),

    intake_confirmed_by =
      p_verified_by,

    intake_confirmation_method =
      'digital_signature_otp',

    intake_confirmation_reference =
      v_handover.id::text,

    updated_at =
      now()

  where id =
    v_handover.service_job_id;


  insert into public.service_job_event (
    company_id,
    service_job_id,
    event_type,
    description,
    metadata,
    user_id
  )
  values (
    v_handover.company_id,
    v_handover.service_job_id,
    'digital_handover_verified',
    'Customer repair intake handover verified by signature and OTP.',
    jsonb_build_object(
      'handover_id',
        v_handover.id,
      'channel',
        v_otp.channel,
      'otp_id',
        v_otp.id,
      'terms_version',
        v_handover.terms_version,
      'receipt_number',
        v_handover.receipt_number
    ),
    p_verified_by
  );


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
    v_handover.company_id,
    p_verified_by,
    'repair_handover_verified',
    'repairs',
    v_handover.service_job_id,
    'Repair intake verified by customer signature and OTP.',
    jsonb_build_object(
      'handover_id',
        v_handover.id,
      'job_number',
        v_handover.job_number_snapshot,
      'channel',
        v_otp.channel,
      'otp_id',
        v_otp.id,
      'terms_version',
        v_handover.terms_version,
      'receipt_number',
        v_handover.receipt_number
    )
  );


  return jsonb_build_object(
    'ok',
      true,
    'handover_id',
      v_handover.id,
    'job_number',
      v_handover.job_number_snapshot,
    'verified_at',
      v_handover.verified_at,
    'receipt_number',
      v_handover.receipt_number
  );

end;
$$;


revoke all
on function
public.repair_finalize_verified_handover(
  uuid,
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function
public.repair_finalize_verified_handover(
  uuid,
  uuid,
  text,
  text,
  text
)
to service_role;
