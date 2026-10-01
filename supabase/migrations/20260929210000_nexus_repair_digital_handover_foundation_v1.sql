-- ============================================================
-- JINLAB Nexus
-- Repair Digital Handover Foundation v1
--
-- Flow:
-- Repair created
-- -> customer reviews details + terms
-- -> customer signs
-- -> OTP delivered
-- -> OTP verified
-- -> intake atomically confirmed
-- -> digital repair receipt/slip
-- ============================================================


-- ============================================================
-- 1. VERSIONED CUSTOMER TERMS
-- ============================================================

create table if not exists public.repair_handover_terms (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  version integer not null
    check (version > 0),

  title text not null
    default 'Repair Device Handover Terms',

  terms_text text not null
    check (
      char_length(
        btrim(terms_text)
      ) >= 50
    ),

  is_active boolean not null
    default false,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  retired_at timestamptz,

  unique (
    company_id,
    version
  )
);


create unique index if not exists
  repair_handover_terms_one_active_per_company
on public.repair_handover_terms(company_id)
where is_active = true;


create index if not exists
  repair_handover_terms_company_idx
on public.repair_handover_terms(
  company_id,
  version desc
);


-- ============================================================
-- 2. SEED SAFE VERSION-1 TERMS FOR EXISTING COMPANIES
-- ============================================================

insert into public.repair_handover_terms (
  company_id,
  version,
  title,
  terms_text,
  is_active
)
select
  c.id,
  1,
  'Repair Device Handover Terms',
  $terms$
By signing this handover, I confirm that the device and accessories listed on this Job Card have been handed to the business in the condition recorded.

I authorise reasonable inspection and diagnosis of the device for the purpose of assessing the reported fault.

No chargeable repair work beyond any amount already agreed will be undertaken without the required customer approval.

I understand that electronic devices may contain personal or business data. Where access to the device is reasonably required for diagnosis or repair, I authorise access only to the extent reasonably necessary to perform that work. I remain responsible for maintaining backups where reasonably possible.

I confirm that the listed accessories, visible condition, serial number or IMEI, where recorded, are correct to the best of my knowledge at the time of handover.

The business will take reasonable care of the device while it is in its possession. Pre-existing faults, hidden defects, prior liquid damage, prior repair damage or other conditions that were not reasonably apparent at intake may affect diagnosis or repair.

I consent to receiving repair-related communications using the contact details supplied, including notifications, quotations, collection notices, OTP verification and the repair handover receipt.

My signature together with successful OTP verification confirms that I handed the listed device to the business and accepted these handover terms.

Nothing in these terms is intended to exclude or limit any right or remedy that cannot lawfully be excluded.
$terms$,
  true
from public.company c
where not exists (
  select 1
  from public.repair_handover_terms t
  where t.company_id = c.id
);


-- ============================================================
-- 2B. TENANT-SAFE PARENT KEYS
--
-- Existing IDs remain the primary keys.
-- These composite unique keys allow new Nexus records to
-- enforce company isolation directly through foreign keys.
-- ============================================================

alter table public.service_job
  add constraint service_job_company_id_id_key
  unique (
    company_id,
    id
  );

alter table public.branch
  add constraint branch_company_id_id_key
  unique (
    company_id,
    id
  );

alter table public.customer
  add constraint customer_company_id_id_key
  unique (
    company_id,
    id
  );


-- ============================================================
-- 3. DIGITAL HANDOVER RECORD
-- ============================================================

create table if not exists public.repair_handover (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid not null,

  service_job_id uuid not null,

  customer_id uuid not null,

  handover_type text not null
    default 'intake'
    check (
      handover_type in (
        'intake',
        'collection'
      )
    ),

  status text not null
    default 'awaiting_signature'
    check (
      status in (
        'draft',
        'awaiting_signature',
        'awaiting_otp',
        'verified',
        'expired',
        'cancelled'
      )
    ),

  terms_version_id uuid not null,

  terms_version integer not null,

  terms_title_snapshot text not null,

  terms_text_snapshot text not null,

  job_number_snapshot text not null,

  customer_name_snapshot text not null,

  customer_phone_snapshot text,

  customer_email_snapshot text,

  device_snapshot jsonb not null
    default '{}'::jsonb
    check (
      jsonb_typeof(device_snapshot) = 'object'
    ),

  terms_accepted_at timestamptz,

  signature_storage_path text,

  signature_sha256 text,

  signed_at timestamptz,

  verification_channel text
    check (
      verification_channel is null
      or verification_channel in (
        'sms',
        'whatsapp',
        'email'
      )
    ),

  verification_destination_masked text,

  otp_verified_at timestamptz,

  verified_at timestamptz,

  verified_by uuid
    references auth.users(id)
    on delete set null,

  receipt_number text,

  receipt_issued_at timestamptz,

  receipt_delivery_channel text
    check (
      receipt_delivery_channel is null
      or receipt_delivery_channel in (
        'sms',
        'whatsapp',
        'email',
        'print',
        'download'
      )
    ),

  receipt_delivered_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint repair_handover_branch_fkey
    foreign key (
      company_id,
      branch_id
    )
    references public.branch(
      company_id,
      id
    ),

  constraint repair_handover_job_fkey
    foreign key (
      company_id,
      service_job_id
    )
    references public.service_job(
      company_id,
      id
    )
    on delete cascade,

  constraint repair_handover_customer_fkey
    foreign key (
      company_id,
      customer_id
    )
    references public.customer(
      company_id,
      id
    ),

  constraint repair_handover_terms_fkey
    foreign key (
      terms_version_id
    )
    references public.repair_handover_terms(id)
);


create index if not exists
  repair_handover_job_idx
on public.repair_handover(
  company_id,
  service_job_id,
  created_at desc
);


create index if not exists
  repair_handover_status_idx
on public.repair_handover(
  company_id,
  status,
  created_at desc
);


create unique index if not exists
  repair_handover_one_live_flow_idx
on public.repair_handover(
  company_id,
  service_job_id,
  handover_type
)
where status in (
  'draft',
  'awaiting_signature',
  'awaiting_otp',
  'verified'
);


-- ============================================================
-- 4. OTP CHALLENGE
--
-- No authenticated client gets direct access to this table.
-- OTP hash is never returned to the browser.
-- ============================================================

create table if not exists public.repair_handover_otp (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  handover_id uuid not null
    references public.repair_handover(id)
    on delete cascade,

  channel text not null
    check (
      channel in (
        'sms',
        'whatsapp',
        'email'
      )
    ),

  destination text not null,

  otp_hash text not null,

  status text not null
    default 'pending'
    check (
      status in (
        'pending',
        'sent',
        'verified',
        'failed',
        'expired',
        'cancelled'
      )
    ),

  attempt_count integer not null
    default 0
    check (
      attempt_count >= 0
    ),

  max_attempts integer not null
    default 5
    check (
      max_attempts between 1 and 10
    ),

  resend_count integer not null
    default 0
    check (
      resend_count >= 0
    ),

  expires_at timestamptz not null,

  sent_at timestamptz,

  verified_at timestamptz,

  provider_message_id text,

  last_error text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);


create index if not exists
  repair_handover_otp_lookup_idx
on public.repair_handover_otp(
  company_id,
  handover_id,
  created_at desc
);


-- ============================================================
-- 5. PRIVATE SIGNATURE STORAGE
--
-- Upload/download will be performed by secure server routes.
-- No public bucket.
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'repair-signatures',
  'repair-signatures',
  false,
  1048576,
  array[
    'image/png',
    'image/webp'
  ]
)
on conflict (id)
do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array[
    'image/png',
    'image/webp'
  ];


-- ============================================================
-- 6. RLS
-- ============================================================

alter table public.repair_handover_terms
  enable row level security;

alter table public.repair_handover
  enable row level security;

alter table public.repair_handover_otp
  enable row level security;


drop policy if exists
  repair_handover_terms_read
on public.repair_handover_terms;

create policy
  repair_handover_terms_read
on public.repair_handover_terms
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission(
    'repair.view'
  )
);


drop policy if exists
  repair_handover_read
on public.repair_handover;

create policy
  repair_handover_read
on public.repair_handover
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission(
    'repair.view'
  )
);


revoke insert, update, delete
on public.repair_handover_terms
from anon, authenticated;

revoke insert, update, delete
on public.repair_handover
from anon, authenticated;

revoke all
on public.repair_handover_otp
from anon, authenticated;


-- ============================================================
-- 7. BEGIN / RESUME INTAKE HANDOVER
-- ============================================================

create or replace function
public.repair_begin_intake_handover(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_customer public.customer%rowtype;
  v_terms public.repair_handover_terms%rowtype;
  v_handover public.repair_handover%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'repair.intake.confirm'
  ) then
    raise exception
      'Permission denied: repair.intake.confirm';
  end if;

  v_company_id :=
    public.current_company_id();


  select *
  into v_job
  from public.service_job
  where id = p_job_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception
      'Job card could not be found.';
  end if;


  if v_job.status in (
    'closed',
    'cancelled',
    'collected'
  ) then
    raise exception
      'This job cannot begin an intake handover.';
  end if;


  select *
  into v_customer
  from public.customer
  where id = v_job.customer_id
    and company_id = v_company_id;

  if not found then
    raise exception
      'Customer could not be found.';
  end if;


  select *
  into v_terms
  from public.repair_handover_terms
  where company_id = v_company_id
    and is_active = true
  order by version desc
  limit 1;

  if not found then
    raise exception
      'No active repair handover terms are configured.';
  end if;


  select *
  into v_handover
  from public.repair_handover
  where company_id = v_company_id
    and service_job_id = p_job_id
    and handover_type = 'intake'
    and status in (
      'draft',
      'awaiting_signature',
      'awaiting_otp',
      'verified'
    )
  order by created_at desc
  limit 1;


  if not found then

    insert into public.repair_handover (
      company_id,
      branch_id,
      service_job_id,
      customer_id,
      handover_type,
      status,
      terms_version_id,
      terms_version,
      terms_title_snapshot,
      terms_text_snapshot,
      job_number_snapshot,
      customer_name_snapshot,
      customer_phone_snapshot,
      customer_email_snapshot,
      device_snapshot,
      receipt_number,
      created_by
    )
    values (
      v_company_id,
      v_job.branch_id,
      v_job.id,
      v_job.customer_id,
      'intake',
      'awaiting_signature',
      v_terms.id,
      v_terms.version,
      v_terms.title,
      v_terms.terms_text,
      v_job.job_number,
      v_customer.customer_name,
      v_customer.phone,
      v_customer.email,
      jsonb_build_object(
        'device_type',
          v_job.device_type,
        'brand',
          v_job.brand,
        'model',
          v_job.model,
        'serial_number',
          v_job.serial_number,
        'imei',
          v_job.imei,
        'device_condition',
          v_job.device_condition,
        'accessories_received',
          v_job.accessories_received,
        'reported_fault',
          v_job.reported_fault
      ),
      v_job.job_number || '-INTAKE',
      auth.uid()
    )
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
      v_company_id,
      v_job.id,
      'digital_handover_started',
      'Customer digital intake handover started.',
      jsonb_build_object(
        'handover_id',
          v_handover.id,
        'terms_version',
          v_terms.version
      ),
      auth.uid()
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
      v_company_id,
      auth.uid(),
      'repair_handover_started',
      'repairs',
      v_job.id,
      'Digital repair intake handover started.',
      jsonb_build_object(
        'handover_id',
          v_handover.id,
        'job_number',
          v_job.job_number,
        'terms_version',
          v_terms.version
      )
    );

  end if;


  return jsonb_build_object(
    'ok',
      true,
    'handover_id',
      v_handover.id,
    'status',
      v_handover.status,
    'job_number',
      v_handover.job_number_snapshot,
    'customer_name',
      v_handover.customer_name_snapshot,
    'customer_phone',
      v_handover.customer_phone_snapshot,
    'customer_email',
      v_handover.customer_email_snapshot,
    'device',
      v_handover.device_snapshot,
    'terms_version',
      v_handover.terms_version,
    'terms_title',
      v_handover.terms_title_snapshot,
    'terms_text',
      v_handover.terms_text_snapshot,
    'signed_at',
      v_handover.signed_at,
    'otp_verified_at',
      v_handover.otp_verified_at,
    'verified_at',
      v_handover.verified_at,
    'verification_channel',
      v_handover.verification_channel,
    'receipt_number',
      v_handover.receipt_number
  );

end;
$$;


-- ============================================================
-- 8. RECORD SIGNATURE AFTER SECURE SERVER UPLOAD
-- ============================================================

create or replace function
public.repair_record_handover_signature(
  p_handover_id uuid,
  p_signature_storage_path text,
  p_signature_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_handover public.repair_handover%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'repair.intake.confirm'
  ) then
    raise exception
      'Permission denied: repair.intake.confirm';
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


  v_company_id :=
    public.current_company_id();


  select *
  into v_handover
  from public.repair_handover
  where id = p_handover_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception
      'Repair handover could not be found.';
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


  update public.repair_handover
  set
    signature_storage_path =
      btrim(
        p_signature_storage_path
      ),

    signature_sha256 =
      lower(
        p_signature_sha256
      ),

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
    p_handover_id

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
    v_company_id,
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
    auth.uid()
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
    v_company_id,
    auth.uid(),
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


-- ============================================================
-- 9. SERVER-ONLY VERIFIED HANDOVER FINALISER
--
-- This is intentionally NOT callable by ordinary
-- authenticated browser clients.
--
-- The future OTP API route will:
-- 1. verify the logged-in Nexus staff session
-- 2. verify the OTP server-side
-- 3. invoke this function using the service role
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
begin

  if p_channel not in (
    'sms',
    'whatsapp',
    'email'
  ) then
    raise exception
      'Invalid OTP verification channel.';
  end if;


  if nullif(
    btrim(
      coalesce(
        p_reference,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'OTP verification reference is required.';
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
      'A signed and accepted handover is required before OTP verification.';
  end if;


  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_verified_by
      and up.company_id = v_handover.company_id
  ) then
    raise exception
      'Verifying Nexus user does not belong to this company.';
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
      p_channel,

    verification_destination_masked =
      nullif(
        btrim(
          coalesce(
            p_destination_masked,
            ''
          )
        ),
        ''
      ),

    otp_verified_at =
      now(),

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
        p_channel,
      'reference',
        p_reference,
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
        p_channel,
      'reference',
        p_reference,
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


-- ============================================================
-- 10. CURRENT HANDOVER STATE
-- ============================================================

create or replace function
public.repair_get_intake_handover(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_handover public.repair_handover%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'repair.view'
  ) then
    raise exception
      'Permission denied: repair.view';
  end if;

  v_company_id :=
    public.current_company_id();


  select *
  into v_handover
  from public.repair_handover
  where company_id =
      v_company_id
    and service_job_id =
      p_job_id
    and handover_type =
      'intake'
  order by created_at desc
  limit 1;


  if not found then
    return jsonb_build_object(
      'found',
        false
    );
  end if;


  return jsonb_build_object(
    'found',
      true,
    'handover_id',
      v_handover.id,
    'status',
      v_handover.status,
    'terms_version',
      v_handover.terms_version,
    'terms_title',
      v_handover.terms_title_snapshot,
    'terms_text',
      v_handover.terms_text_snapshot,
    'signed_at',
      v_handover.signed_at,
    'verification_channel',
      v_handover.verification_channel,
    'verification_destination_masked',
      v_handover.verification_destination_masked,
    'otp_verified_at',
      v_handover.otp_verified_at,
    'verified_at',
      v_handover.verified_at,
    'receipt_number',
      v_handover.receipt_number
  );

end;
$$;


-- ============================================================
-- 11. FUNCTION SECURITY
-- ============================================================

revoke all
on function
public.repair_begin_intake_handover(uuid)
from public, anon;

grant execute
on function
public.repair_begin_intake_handover(uuid)
to authenticated;


revoke all
on function
public.repair_record_handover_signature(
  uuid,
  text,
  text
)
from public, anon;

grant execute
on function
public.repair_record_handover_signature(
  uuid,
  text,
  text
)
to authenticated;


revoke all
on function
public.repair_get_intake_handover(uuid)
from public, anon;

grant execute
on function
public.repair_get_intake_handover(uuid)
to authenticated;


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


-- ============================================================
-- 12. CUSTOMER CONTACT + EXPLICIT MARKETING CONSENT
-- ============================================================

alter table public.repair_handover
  add column if not exists
    marketing_email_opt_in boolean not null default false,
  add column if not exists
    marketing_sms_opt_in boolean not null default false,
  add column if not exists
    marketing_whatsapp_opt_in boolean not null default false,
  add column if not exists
    marketing_consent_at timestamptz;


create or replace function
public.repair_update_handover_contact(
  p_handover_id uuid,
  p_phone text default null,
  p_email text default null,
  p_marketing_email boolean default false,
  p_marketing_sms boolean default false,
  p_marketing_whatsapp boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_handover public.repair_handover%rowtype;
  v_customer public.customer%rowtype;
  v_phone text;
  v_email text;
  v_rows integer;
  v_evidence jsonb;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'repair.intake.confirm'
  ) then
    raise exception
      'Permission denied: repair.intake.confirm';
  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_handover
  from public.repair_handover
  where id = p_handover_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception
      'Repair handover could not be found.';
  end if;


  if v_handover.status in (
    'verified',
    'cancelled',
    'expired'
  ) then
    raise exception
      'Customer contact details cannot be changed for this handover.';
  end if;


  select *
  into v_customer
  from public.customer
  where id = v_handover.customer_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception
      'Customer could not be found.';
  end if;


  v_phone :=
    nullif(
      btrim(
        coalesce(
          p_phone,
          ''
        )
      ),
      ''
    );


  v_email :=
    nullif(
      lower(
        btrim(
          coalesce(
            p_email,
            ''
          )
        )
      ),
      ''
    );


  if v_phone is not null
     and char_length(v_phone) < 7
  then
    raise exception
      'Enter a valid customer mobile number.';
  end if;


  if v_email is not null
     and v_email !~
       '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  then
    raise exception
      'Enter a valid customer email address.';
  end if;


  -- Preserve existing contact details if the customer
  -- does not supply a replacement.
  v_phone :=
    coalesce(
      v_phone,
      nullif(
        btrim(
          coalesce(
            v_customer.phone,
            ''
          )
        ),
        ''
      )
    );


  v_email :=
    coalesce(
      v_email,
      nullif(
        lower(
          btrim(
            coalesce(
              v_customer.email,
              ''
            )
          )
        ),
        ''
      )
    );


  if v_phone is null
     and v_email is null
  then
    raise exception
      'A mobile number or email address is required for digital verification.';
  end if;


  update public.customer
  set
    phone =
      coalesce(
        v_phone,
        phone
      ),

    email =
      coalesce(
        v_email,
        email
      ),

    updated_at =
      now()

  where id =
    v_customer.id;


  update public.repair_handover
  set
    customer_phone_snapshot =
      v_phone,

    customer_email_snapshot =
      v_email,

    marketing_email_opt_in =
      coalesce(
        p_marketing_email,
        false
      ),

    marketing_sms_opt_in =
      coalesce(
        p_marketing_sms,
        false
      ),

    marketing_whatsapp_opt_in =
      coalesce(
        p_marketing_whatsapp,
        false
      ),

    marketing_consent_at =
      case
        when coalesce(
          p_marketing_email,
          false
        )
        or coalesce(
          p_marketing_sms,
          false
        )
        or coalesce(
          p_marketing_whatsapp,
          false
        )
        then now()
        else marketing_consent_at
      end,

    updated_at =
      now()

  where id =
    v_handover.id;


  v_evidence :=
    jsonb_build_object(
      'source',
        'repair_handover',
      'handover_id',
        v_handover.id,
      'service_job_id',
        v_handover.service_job_id,
      'job_number',
        v_handover.job_number_snapshot,
      'terms_version',
        v_handover.terms_version,
      'explicit_opt_in',
        true,
      'captured_at',
        now()
    );


  -- ========================================================
  -- EMAIL MARKETING CONSENT
  -- ========================================================

  if coalesce(
    p_marketing_email,
    false
  ) then

    if v_email is null then
      raise exception
        'An email address is required for email marketing consent.';
    end if;


    update public.communication_consent
    set
      customer_id =
        v_handover.customer_id,

      status =
        'granted',

      source =
        'repair_handover',

      legal_basis =
        'consent',

      consented_at =
        now(),

      withdrawn_at =
        null,

      evidence =
        v_evidence,

      updated_at =
        now()

    where company_id =
        v_company_id
      and channel =
        'email'
      and lower(address) =
        lower(v_email)
      and purpose =
        'marketing';


    get diagnostics
      v_rows = row_count;


    if v_rows = 0 then

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
        evidence,
        created_by,
        created_at,
        updated_at
      )
      values (
        v_company_id,
        v_handover.customer_id,
        'email',
        v_email,
        'marketing',
        'granted',
        'repair_handover',
        'consent',
        now(),
        v_evidence,
        auth.uid(),
        now(),
        now()
      );

    end if;

  end if;


  -- ========================================================
  -- SMS MARKETING CONSENT
  -- ========================================================

  if coalesce(
    p_marketing_sms,
    false
  ) then

    if v_phone is null then
      raise exception
        'A mobile number is required for SMS marketing consent.';
    end if;


    update public.communication_consent
    set
      customer_id =
        v_handover.customer_id,

      status =
        'granted',

      source =
        'repair_handover',

      legal_basis =
        'consent',

      consented_at =
        now(),

      withdrawn_at =
        null,

      evidence =
        v_evidence,

      updated_at =
        now()

    where company_id =
        v_company_id
      and channel =
        'sms'
      and lower(address) =
        lower(v_phone)
      and purpose =
        'marketing';


    get diagnostics
      v_rows = row_count;


    if v_rows = 0 then

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
        evidence,
        created_by,
        created_at,
        updated_at
      )
      values (
        v_company_id,
        v_handover.customer_id,
        'sms',
        v_phone,
        'marketing',
        'granted',
        'repair_handover',
        'consent',
        now(),
        v_evidence,
        auth.uid(),
        now(),
        now()
      );

    end if;

  end if;


  -- ========================================================
  -- WHATSAPP MARKETING CONSENT
  -- ========================================================

  if coalesce(
    p_marketing_whatsapp,
    false
  ) then

    if v_phone is null then
      raise exception
        'A mobile number is required for WhatsApp marketing consent.';
    end if;


    update public.communication_consent
    set
      customer_id =
        v_handover.customer_id,

      status =
        'granted',

      source =
        'repair_handover',

      legal_basis =
        'consent',

      consented_at =
        now(),

      withdrawn_at =
        null,

      evidence =
        v_evidence,

      updated_at =
        now()

    where company_id =
        v_company_id
      and channel =
        'whatsapp'
      and lower(address) =
        lower(v_phone)
      and purpose =
        'marketing';


    get diagnostics
      v_rows = row_count;


    if v_rows = 0 then

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
        evidence,
        created_by,
        created_at,
        updated_at
      )
      values (
        v_company_id,
        v_handover.customer_id,
        'whatsapp',
        v_phone,
        'marketing',
        'granted',
        'repair_handover',
        'consent',
        now(),
        v_evidence,
        auth.uid(),
        now(),
        now()
      );

    end if;

  end if;


  insert into public.service_job_event (
    company_id,
    service_job_id,
    event_type,
    description,
    metadata,
    user_id
  )
  values (
    v_company_id,
    v_handover.service_job_id,
    'handover_contact_updated',
    'Customer contact details confirmed for digital repair handover.',
    jsonb_build_object(
      'handover_id',
        v_handover.id,
      'has_phone',
        v_phone is not null,
      'has_email',
        v_email is not null,
      'marketing_email',
        coalesce(
          p_marketing_email,
          false
        ),
      'marketing_sms',
        coalesce(
          p_marketing_sms,
          false
        ),
      'marketing_whatsapp',
        coalesce(
          p_marketing_whatsapp,
          false
        )
    ),
    auth.uid()
  );


  return jsonb_build_object(
    'ok',
      true,
    'handover_id',
      v_handover.id,
    'phone',
      v_phone,
    'email',
      v_email,
    'sms_available',
      v_phone is not null,
    'whatsapp_available',
      v_phone is not null,
    'email_available',
      v_email is not null,
    'marketing_email',
      coalesce(
        p_marketing_email,
        false
      ),
    'marketing_sms',
      coalesce(
        p_marketing_sms,
        false
      ),
    'marketing_whatsapp',
      coalesce(
        p_marketing_whatsapp,
        false
      )
  );

end;
$$;


revoke all
on function
public.repair_update_handover_contact(
  uuid,
  text,
  text,
  boolean,
  boolean,
  boolean
)
from public, anon;

grant execute
on function
public.repair_update_handover_contact(
  uuid,
  text,
  text,
  boolean,
  boolean,
  boolean
)
to authenticated;
