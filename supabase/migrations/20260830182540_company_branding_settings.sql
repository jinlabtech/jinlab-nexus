-- ============================================================
-- JINLAB Nexus
-- Sprint 18.12 - Company Branding Settings
-- ============================================================

alter table public.company
    add column if not exists trading_name text,
    add column if not exists physical_address text,
    add column if not exists vat_registered boolean not null default false,
    add column if not exists vat_number text,
    add column if not exists logo_path text,
    add column if not exists website text,
    add column if not exists document_footer text;

-- VAT number should not remain active when VAT is disabled.
create or replace function public.validate_company_tax_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.vat_registered = false then
        new.vat_number := null;
    end if;

    return new;
end;
$$;

drop trigger if exists company_validate_tax_settings
on public.company;

create trigger company_validate_tax_settings
before insert or update
on public.company
for each row
execute function public.validate_company_tax_settings();


-- ============================================================
-- COMPANY LOGO STORAGE
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'company-logos',
    'company-logos',
    false,
    5242880,
    array[
        'image/png',
        'image/jpeg',
        'image/webp'
    ]
)
on conflict (id)
do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- Logo path format:
-- company_id/logo.ext
--
-- A user may only access the folder belonging to
-- their own company.

drop policy if exists
"Users can view their company logos"
on storage.objects;

create policy
"Users can view their company logos"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] in (
        select company_id::text
        from public.user_profile
        where user_id = auth.uid()
    )
);


drop policy if exists
"Users can upload their company logos"
on storage.objects;

create policy
"Users can upload their company logos"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] in (
        select company_id::text
        from public.user_profile
        where user_id = auth.uid()
    )
);


drop policy if exists
"Users can update their company logos"
on storage.objects;

create policy
"Users can update their company logos"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] in (
        select company_id::text
        from public.user_profile
        where user_id = auth.uid()
    )
)
with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] in (
        select company_id::text
        from public.user_profile
        where user_id = auth.uid()
    )
);


drop policy if exists
"Users can delete their company logos"
on storage.objects;

create policy
"Users can delete their company logos"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] in (
        select company_id::text
        from public.user_profile
        where user_id = auth.uid()
    )
);

-- ============================================================
-- END
-- ============================================================
