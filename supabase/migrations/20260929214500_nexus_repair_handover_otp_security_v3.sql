-- ============================================================
-- JINLAB NEXUS
-- Repair Digital Handover OTP Security V3
--
-- Server-only OTP lifecycle:
--   issue -> delivery -> verify
--
-- Plain OTP values are NEVER stored.
-- ============================================================


-- ============================================================
-- 1. ISSUE OTP CHALLENGE
-- ============================================================

create or replace function
public.repair_issue_handover_otp(
  p_handover_id uuid,
  p_actor_user_id uuid,
  p_channel text,
  p_destination text,
  p_otp_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_handover public.repair_handover%rowtype;
  v_recent_count integer;
  v_resend_count integer;
  v_otp public.repair_handover_otp%rowtype;
  v_destination text;
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
      'Invalid OTP channel.';
  end if;


  v_destination :=
    nullif(
      btrim(
        coalesce(
          p_destination,
          ''
        )
      ),
      ''
    );


  if v_destination is null
     or char_length(v_destination) < 3
     or char_length(v_destination) > 320
  then
    raise exception
      'OTP destination is invalid.';
  end if;


  if p_otp_hash is null
     or p_otp_hash
        !~ '^[a-fA-F0-9]{64}$'
  then
    raise exception
      'Valid OTP digest is required.';
  end if;


  if p_expires_at <= now()
     or p_expires_at > now() + interval '10 minutes'
  then
    raise exception
      'OTP expiry time is invalid.';
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


  if v_handover.status <> 'awaiting_otp' then
    raise exception
      'Customer signature is required before OTP verification.';
  end if;


  if v_handover.signature_storage_path is null
     or v_handover.signature_sha256 is null
     or v_handover.signed_at is null
     or v_handover.terms_accepted_at is null
  then
    raise exception
      'Signed handover terms are required.';
  end if;


  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_actor_user_id
      and up.company_id =
        v_handover.company_id
  ) then
    raise exception
      'Nexus user does not belong to this company.';
  end if;


  -- ----------------------------------------------------------
  -- 60 second resend cooldown
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.repair_handover_otp o
    where o.company_id =
        v_handover.company_id
      and o.handover_id =
        v_handover.id
      and o.status in (
        'pending',
        'sent'
      )
      and o.created_at >
        now() - interval '60 seconds'
  ) then
    raise exception
      'Please wait 60 seconds before requesting another OTP.';
  end if;


  -- ----------------------------------------------------------
  -- Maximum 5 issued OTPs per 15 minutes
  -- ----------------------------------------------------------

  select count(*)
  into v_recent_count
  from public.repair_handover_otp o
  where o.company_id =
      v_handover.company_id
    and o.handover_id =
      v_handover.id
    and o.created_at >
      now() - interval '15 minutes';


  if v_recent_count >= 5 then
    raise exception
      'Too many OTP requests. Please try again later.';
  end if;


  select count(*)
  into v_resend_count
  from public.repair_handover_otp o
  where o.company_id =
      v_handover.company_id
    and o.handover_id =
      v_handover.id;


  -- Expire any previous live challenge.
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
    and status in (
      'pending',
      'sent'
    );


  insert into public.repair_handover_otp (
    company_id,
    handover_id,
    channel,
    destination,
    otp_hash,
    status,
    attempt_count,
    max_attempts,
    resend_count,
    expires_at,
    created_at,
    updated_at
  )
  values (
    v_handover.company_id,
    v_handover.id,
    p_channel,
    v_destination,
    lower(p_otp_hash),
    'pending',
    0,
    5,
    v_resend_count,
    p_expires_at,
    now(),
    now()
  )
  returning *
  into v_otp;


  return jsonb_build_object(
    'ok',
      true,
    'otp_id',
      v_otp.id,
    'handover_id',
      v_handover.id,
    'channel',
      v_otp.channel,
    'expires_at',
      v_otp.expires_at,
    'max_attempts',
      v_otp.max_attempts
  );

end;
$$;


revoke all
on function public.repair_issue_handover_otp(
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.repair_issue_handover_otp(
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
)
to service_role;


-- ============================================================
-- 2. RECORD DELIVERY RESULT
-- ============================================================

create or replace function
public.repair_mark_handover_otp_delivery(
  p_otp_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_otp public.repair_handover_otp%rowtype;
begin

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Server authorization required.';
  end if;


  select *
  into v_otp
  from public.repair_handover_otp
  where id = p_otp_id
  for update;


  if not found then
    raise exception
      'OTP record could not be found.';
  end if;


  if v_otp.status not in (
    'pending',
    'sent'
  ) then
    return jsonb_build_object(
      'ok',
        false,
      'otp_id',
        v_otp.id,
      'status',
        v_otp.status
    );
  end if;


  update public.repair_handover_otp
  set
    status =
      case
        when p_success then 'sent'
        else 'failed'
      end,

    sent_at =
      case
        when p_success then now()
        else sent_at
      end,

    provider_message_id =
      nullif(
        btrim(
          coalesce(
            p_provider_message_id,
            ''
          )
        ),
        ''
      ),

    last_error =
      case
        when p_success then null
        else left(
          nullif(
            btrim(
              coalesce(
                p_error,
                ''
              )
            ),
            ''
          ),
          500
        )
      end,

    updated_at =
      now()

  where id =
    v_otp.id

  returning *
  into v_otp;


  return jsonb_build_object(
    'ok',
      p_success,
    'otp_id',
      v_otp.id,
    'status',
      v_otp.status,
    'sent_at',
      v_otp.sent_at
  );

end;
$$;


revoke all
on function public.repair_mark_handover_otp_delivery(
  uuid,
  boolean,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.repair_mark_handover_otp_delivery(
  uuid,
  boolean,
  text,
  text
)
to service_role;


-- ============================================================
-- 3. VERIFY OTP DIGEST
-- ============================================================

create or replace function
public.repair_verify_handover_otp(
  p_otp_id uuid,
  p_actor_user_id uuid,
  p_otp_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_otp public.repair_handover_otp%rowtype;
  v_handover public.repair_handover%rowtype;
  v_attempts integer;
begin

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception
      'Server authorization required.';
  end if;


  if p_otp_hash is null
     or p_otp_hash
        !~ '^[a-fA-F0-9]{64}$'
  then
    raise exception
      'Valid OTP digest is required.';
  end if;


  select *
  into v_otp
  from public.repair_handover_otp
  where id = p_otp_id
  for update;


  if not found then
    raise exception
      'OTP record could not be found.';
  end if;


  select *
  into v_handover
  from public.repair_handover
  where id = v_otp.handover_id
  for update;


  if not found then
    raise exception
      'Repair handover could not be found.';
  end if;


  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_actor_user_id
      and up.company_id =
        v_otp.company_id
  ) then
    raise exception
      'Nexus user does not belong to this company.';
  end if;


  if v_handover.status = 'verified' then
    return jsonb_build_object(
      'ok',
        true,
      'already_verified',
        true,
      'otp_id',
        v_otp.id
    );
  end if;


  if v_handover.status <> 'awaiting_otp' then
    return jsonb_build_object(
      'ok',
        false,
      'code',
        'handover_not_waiting'
    );
  end if;


  if v_otp.status = 'verified' then
    return jsonb_build_object(
      'ok',
        true,
      'otp_id',
        v_otp.id,
      'already_verified',
        true
    );
  end if;


  if v_otp.status <> 'sent' then
    return jsonb_build_object(
      'ok',
        false,
      'code',
        'otp_not_active',
      'status',
        v_otp.status
    );
  end if;


  if now() > v_otp.expires_at then

    update public.repair_handover_otp
    set
      status =
        'expired',
      updated_at =
        now()
    where id =
      v_otp.id;

    return jsonb_build_object(
      'ok',
        false,
      'code',
        'expired'
    );

  end if;


  if v_otp.attempt_count >= v_otp.max_attempts then

    update public.repair_handover_otp
    set
      status =
        'failed',
      updated_at =
        now()
    where id =
      v_otp.id;

    return jsonb_build_object(
      'ok',
        false,
      'code',
        'too_many_attempts'
    );

  end if;


  if lower(v_otp.otp_hash) <>
     lower(p_otp_hash)
  then

    v_attempts :=
      v_otp.attempt_count + 1;


    update public.repair_handover_otp
    set
      attempt_count =
        v_attempts,

      status =
        case
          when v_attempts >= max_attempts
            then 'failed'
          else status
        end,

      updated_at =
        now()

    where id =
      v_otp.id;


    return jsonb_build_object(
      'ok',
        false,
      'code',
        case
          when v_attempts >= v_otp.max_attempts
            then 'too_many_attempts'
          else 'invalid_code'
        end,
      'attempts_remaining',
        greatest(
          v_otp.max_attempts - v_attempts,
          0
        )
    );

  end if;


  update public.repair_handover_otp
  set
    status =
      'verified',

    attempt_count =
      attempt_count + 1,

    verified_at =
      now(),

    updated_at =
      now()

  where id =
    v_otp.id

  returning *
  into v_otp;


  return jsonb_build_object(
    'ok',
      true,
    'otp_id',
      v_otp.id,
    'handover_id',
      v_otp.handover_id,
    'channel',
      v_otp.channel,
    'verified_at',
      v_otp.verified_at
  );

end;
$$;


revoke all
on function public.repair_verify_handover_otp(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute
on function public.repair_verify_handover_otp(
  uuid,
  uuid,
  text
)
to service_role;
