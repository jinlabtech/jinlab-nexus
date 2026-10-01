alter table public.hr_document_record
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists uploaded_at timestamptz,
  add column if not exists uploaded_by uuid;

create unique index if not exists hr_document_record_file_path_uq
  on public.hr_document_record(company_id, file_path)
  where file_path is not null and btrim(file_path) <> '';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'hr-documents',
  'hr-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_manage_hr_document_object(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path='public','storage'
as $$
declare
  v_company_id uuid;
  v_parts text[];
begin
  if auth.uid() is null then return false; end if;
  if not public.current_user_has_permission('hr.documents.manage') then return false; end if;

  v_company_id := public.current_company_id();
  v_parts := storage.foldername(coalesce(p_name,''));

  if coalesce(array_length(v_parts,1),0) < 2 then return false; end if;
  if v_parts[1] <> v_company_id::text then return false; end if;

  return exists(
    select 1
    from public.hr_employee e
    where e.company_id=v_company_id
      and e.id::text=v_parts[2]
  );
end;
$$;

revoke all on function public.can_manage_hr_document_object(text) from public, anon;
grant execute on function public.can_manage_hr_document_object(text) to authenticated;

drop policy if exists "HR managers can view HR documents" on storage.objects;
drop policy if exists "HR managers can upload HR documents" on storage.objects;
drop policy if exists "HR managers can update HR documents" on storage.objects;
drop policy if exists "HR managers can delete HR documents" on storage.objects;

create policy "HR managers can view HR documents"
on storage.objects for select to authenticated
using (
  bucket_id='hr-documents'
  and public.can_manage_hr_document_object(name)
);

create policy "HR managers can upload HR documents"
on storage.objects for insert to authenticated
with check (
  bucket_id='hr-documents'
  and public.can_manage_hr_document_object(name)
);

create policy "HR managers can update HR documents"
on storage.objects for update to authenticated
using (
  bucket_id='hr-documents'
  and public.can_manage_hr_document_object(name)
)
with check (
  bucket_id='hr-documents'
  and public.can_manage_hr_document_object(name)
);

create policy "HR managers can delete HR documents"
on storage.objects for delete to authenticated
using (
  bucket_id='hr-documents'
  and public.can_manage_hr_document_object(name)
);

create or replace function public.register_hr_document_file(
  p_employee_id uuid,
  p_document_type text,
  p_title text,
  p_file_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_issued_date date default null,
  p_expiry_date date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','storage'
as $$
declare
  v_company_id uuid;
  v_id uuid;
  v_type text;
  v_path text;
  v_allowed_mime text[] := array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.documents.manage') then
    raise exception 'Permission denied: hr.documents.manage';
  end if;

  v_company_id := public.current_company_id();
  v_type := lower(btrim(coalesce(p_document_type,'')));
  v_path := btrim(coalesce(p_file_path,''));

  if v_type not in ('contract','id_document','certificate','medical_note','warning','performance','policy_acknowledgement','other') then
    raise exception 'Unsupported document type.';
  end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Document title is required.'; end if;
  if v_path='' then raise exception 'Uploaded file path is required.'; end if;
  if p_file_size_bytes is null or p_file_size_bytes<=0 or p_file_size_bytes>15728640 then
    raise exception 'HR document must be between 1 byte and 15 MB.';
  end if;
  if coalesce(p_mime_type,'') <> all(v_allowed_mime) then
    raise exception 'Unsupported HR document file type.';
  end if;
  if p_expiry_date is not null and p_issued_date is not null and p_expiry_date<p_issued_date then
    raise exception 'Document expiry date is invalid.';
  end if;
  if not exists(select 1 from public.hr_employee e where e.id=p_employee_id and e.company_id=v_company_id) then
    raise exception 'Employee could not be found.';
  end if;
  if v_path not like v_company_id::text || '/' || p_employee_id::text || '/%' then
    raise exception 'HR document path does not match the employee/company.';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='hr-documents' and o.name=v_path) then
    raise exception 'Uploaded HR document could not be found in secure storage.';
  end if;

  insert into public.hr_document_record(
    company_id,employee_id,document_type,title,file_path,
    original_file_name,mime_type,file_size_bytes,uploaded_at,uploaded_by,
    issued_date,expiry_date,status,notes,created_by
  )
  values(
    v_company_id,p_employee_id,v_type,btrim(p_title),v_path,
    nullif(btrim(coalesce(p_original_file_name,'')),''),p_mime_type,p_file_size_bytes,now(),auth.uid(),
    p_issued_date,p_expiry_date,'current',nullif(btrim(coalesce(p_notes,'')),''),auth.uid()
  ) returning id into v_id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(
    v_company_id,auth.uid(),'hr_document_uploaded','hr',v_id,'Secure HR document uploaded.',
    jsonb_build_object('employee_id',p_employee_id,'document_type',v_type,'file_path',v_path,'mime_type',p_mime_type,'file_size_bytes',p_file_size_bytes)
  );

  return jsonb_build_object('ok',true,'id',v_id,'file_path',v_path,'status','current');
end;
$$;

create or replace function public.get_hr_documents_workspace(p_employee_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.documents.manage') then
    raise exception 'Permission denied: hr.documents.manage';
  end if;

  v_company_id := public.current_company_id();

  if p_employee_id is not null and not exists(
    select 1 from public.hr_employee e where e.id=p_employee_id and e.company_id=v_company_id
  ) then raise exception 'Employee could not be found.'; end if;

  return jsonb_build_object(
    'ok',true,
    'company_id',v_company_id,
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,
        'employee_number',e.employee_number,
        'name',e.first_name||' '||e.last_name,
        'status',e.status
      ) order by e.last_name,e.first_name)
      from public.hr_employee e
      where e.company_id=v_company_id
    ),'[]'::jsonb),
    'documents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'employee_id',d.employee_id,
        'employee_number',e.employee_number,
        'employee_name',e.first_name||' '||e.last_name,
        'document_type',d.document_type,
        'title',d.title,
        'file_path',d.file_path,
        'original_file_name',d.original_file_name,
        'mime_type',d.mime_type,
        'file_size_bytes',d.file_size_bytes,
        'issued_date',d.issued_date,
        'expiry_date',d.expiry_date,
        'status',d.status,
        'notes',d.notes,
        'uploaded_at',d.uploaded_at,
        'created_at',d.created_at
      ) order by coalesce(d.uploaded_at,d.created_at) desc)
      from public.hr_document_record d
      join public.hr_employee e on e.id=d.employee_id
      where d.company_id=v_company_id
        and (p_employee_id is null or d.employee_id=p_employee_id)
    ),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',(select count(*) from public.hr_document_record d where d.company_id=v_company_id and (p_employee_id is null or d.employee_id=p_employee_id)),
      'current',(select count(*) from public.hr_document_record d where d.company_id=v_company_id and d.status='current' and (p_employee_id is null or d.employee_id=p_employee_id)),
      'expiring_30_days',(select count(*) from public.hr_document_record d where d.company_id=v_company_id and d.status='current' and d.expiry_date between current_date and current_date+30 and (p_employee_id is null or d.employee_id=p_employee_id))
    )
  );
end;
$$;

create or replace function public.archive_hr_document_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.documents.manage') then
    raise exception 'Permission denied: hr.documents.manage';
  end if;

  v_company_id := public.current_company_id();

  update public.hr_document_record
  set status='archived',updated_at=now()
  where id=p_record_id and company_id=v_company_id
  returning employee_id into v_employee_id;

  if v_employee_id is null then raise exception 'HR document record could not be found.'; end if;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_document_archived','hr',p_record_id,'HR document record archived.',jsonb_build_object('employee_id',v_employee_id));

  return jsonb_build_object('ok',true,'id',p_record_id,'status','archived');
end;
$$;

revoke all on function public.register_hr_document_file(uuid,text,text,text,text,text,bigint,date,date,text) from public, anon;
revoke all on function public.get_hr_documents_workspace(uuid) from public, anon;
revoke all on function public.archive_hr_document_record(uuid) from public, anon;
grant execute on function public.register_hr_document_file(uuid,text,text,text,text,text,bigint,date,date,text) to authenticated;
grant execute on function public.get_hr_documents_workspace(uuid) to authenticated;
grant execute on function public.archive_hr_document_record(uuid) to authenticated;;
