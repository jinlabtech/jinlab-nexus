update public.company_document_settings cds
set logo_path = c.logo_path,
    updated_at = now()
from public.company c
where cds.company_id = c.id
  and c.logo_path is not null
  and trim(c.logo_path) <> ''
  and cds.logo_path is null;
