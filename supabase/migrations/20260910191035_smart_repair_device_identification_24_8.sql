alter table public.service_job_scan drop constraint if exists service_job_scan_match_type_check;
alter table public.service_job_scan add constraint service_job_scan_match_type_check check (match_type in ('job_number','serial_number','imei','model','brand_model','embedded_serial','embedded_imei','ambiguous','unmatched'));

create or replace function public.smart_identify_service_job(
  p_scanner_device_id uuid,
  p_scanned_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_device public.service_scanner_device%rowtype;
  v_employee_id uuid;
  v_raw text;
  v_norm text;
  v_digits text;
  v_top_score integer;
  v_top_active boolean;
  v_top_count integer;
  v_job_id uuid;
  v_match text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.scanner.use') then raise exception 'Permission denied: repair.scanner.use'; end if;

  v_raw := btrim(coalesce(p_scanned_value,''));
  if v_raw = '' then raise exception 'Scan value is required.'; end if;

  v_company_id := public.current_company_id();
  select * into v_device
  from public.service_scanner_device
  where id = p_scanner_device_id and company_id = v_company_id and is_active = true;
  if not found then raise exception 'Scanner device is not registered or is inactive.'; end if;

  select e.id into v_employee_id
  from public.hr_employee e
  where e.company_id = v_company_id and e.user_id = auth.uid() and e.status='active'
  limit 1;

  v_norm := regexp_replace(upper(v_raw),'[^A-Z0-9]','','g');
  v_digits := regexp_replace(v_raw,'[^0-9]','','g');

  with candidates as (
    select
      j.id,
      j.updated_at,
      (j.status not in ('closed','cancelled')) as active,
      case
        when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 1000
        when j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]','','g') = v_digits then 980
        when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 4
             and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') = v_norm then 960
        when j.imei is not null and length(regexp_replace(j.imei,'[^0-9]','','g')) >= 10
             and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits) > 0 then 930
        when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 5
             and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm) > 0 then 900
        when j.brand is not null and j.model is not null
             and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g') = v_norm then 850
        when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) >= 3
             and regexp_replace(upper(j.model),'[^A-Z0-9]','','g') = v_norm then 800
        when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) >= 4
             and (
               position(regexp_replace(upper(j.model),'[^A-Z0-9]','','g') in v_norm) > 0
               or position(v_norm in regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) > 0
             ) then 650
        else 0
      end as score
    from public.service_job j
    where j.company_id = v_company_id
      and j.branch_id = v_device.branch_id
  ), ranked as (
    select * from candidates where score >= 650
  )
  select score, active into v_top_score, v_top_active
  from ranked
  order by active desc, score desc, updated_at desc
  limit 1;

  if v_top_score is null then
    update public.service_scanner_device set last_seen_at=now(), updated_at=now() where id=v_device.id;
    insert into public.service_job_scan(company_id,branch_id,scanner_device_id,service_job_id,scanned_value,match_type,scan_action,user_id,employee_id,metadata)
    values(v_company_id,v_device.branch_id,v_device.id,null,v_raw,'unmatched','lookup',auth.uid(),v_employee_id,jsonb_build_object('engine','smart_v1'));
    return jsonb_build_object('ok',true,'found',false,'ambiguous',false,'scan_value',v_raw,'message','No likely repair job matched this Job Card, IMEI, serial number or model.');
  end if;

  with candidates as (
    select
      j.id,
      j.job_number,
      j.status,
      j.updated_at,
      j.customer_id,
      j.device_type,
      j.brand,
      j.model,
      j.serial_number,
      j.imei,
      j.reported_fault,
      j.assigned_employee_id,
      j.approved_amount,
      j.invoice_id,
      (j.intake_confirmed_at is not null) as intake_confirmed,
      j.repair_started_at,
      (j.status not in ('closed','cancelled')) as active,
      case
        when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 1000
        when j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]','','g') = v_digits then 980
        when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 4
             and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') = v_norm then 960
        when j.imei is not null and length(regexp_replace(j.imei,'[^0-9]','','g')) >= 10
             and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits) > 0 then 930
        when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 5
             and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm) > 0 then 900
        when j.brand is not null and j.model is not null
             and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g') = v_norm then 850
        when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) >= 3
             and regexp_replace(upper(j.model),'[^A-Z0-9]','','g') = v_norm then 800
        when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) >= 4
             and (
               position(regexp_replace(upper(j.model),'[^A-Z0-9]','','g') in v_norm) > 0
               or position(v_norm in regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) > 0
             ) then 650
        else 0
      end as score,
      case
        when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 'job_number'
        when j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]','','g') = v_digits then 'imei'
        when j.serial_number is not null and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') = v_norm then 'serial_number'
        when j.imei is not null and length(regexp_replace(j.imei,'[^0-9]','','g')) >= 10 and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits) > 0 then 'embedded_imei'
        when j.serial_number is not null and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm) > 0 then 'embedded_serial'
        when j.brand is not null and j.model is not null and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g') = v_norm then 'brand_model'
        else 'model'
      end as match_type,
      c.customer_name,
      nullif(btrim(concat_ws(' ',e.first_name,e.last_name)),'') as assigned_employee,
      i.invoice_number,
      i.balance_due
    from public.service_job j
    join public.customer c on c.id=j.customer_id and c.company_id=j.company_id
    left join public.hr_employee e on e.id=j.assigned_employee_id and e.company_id=j.company_id
    left join public.invoice i on i.id=j.invoice_id and i.company_id=j.company_id
    where j.company_id=v_company_id and j.branch_id=v_device.branch_id
  ), eligible as (
    select * from candidates where score >= 650
  ), topgroup as (
    select * from eligible where active=v_top_active and score=v_top_score
  )
  select count(*) into v_top_count from topgroup;

  if v_top_count > 1 then
    with candidates as (
      select j.*, c.customer_name,
        case
          when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 1000
          when j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]','','g') = v_digits then 980
          when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 4 and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') = v_norm then 960
          when j.imei is not null and length(regexp_replace(j.imei,'[^0-9]','','g')) >= 10 and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits)>0 then 930
          when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')) >= 5 and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm)>0 then 900
          when j.brand is not null and j.model is not null and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g') = v_norm then 850
          when j.model is not null and regexp_replace(upper(j.model),'[^A-Z0-9]','','g') = v_norm then 800
          when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g')) >= 4 and (position(regexp_replace(upper(j.model),'[^A-Z0-9]','','g') in v_norm)>0 or position(v_norm in regexp_replace(upper(j.model),'[^A-Z0-9]','','g'))>0) then 650
          else 0 end as score,
        (j.status not in ('closed','cancelled')) as active
      from public.service_job j join public.customer c on c.id=j.customer_id and c.company_id=j.company_id
      where j.company_id=v_company_id and j.branch_id=v_device.branch_id
    )
    select jsonb_agg(jsonb_build_object('id',id,'job_number',job_number,'status',status,'customer_name',customer_name,'device_type',device_type,'brand',brand,'model',model,'serial_number',serial_number,'imei',imei,'score',score) order by updated_at desc)
    into v_result
    from candidates
    where active=v_top_active and score=v_top_score;

    update public.service_scanner_device set last_seen_at=now(), updated_at=now() where id=v_device.id;
    insert into public.service_job_scan(company_id,branch_id,scanner_device_id,service_job_id,scanned_value,match_type,scan_action,user_id,employee_id,metadata)
    values(v_company_id,v_device.branch_id,v_device.id,null,v_raw,'ambiguous','lookup',auth.uid(),v_employee_id,jsonb_build_object('engine','smart_v1','candidates',v_result));

    return jsonb_build_object('ok',true,'found',false,'ambiguous',true,'scan_value',v_raw,'candidates',coalesce(v_result,'[]'::jsonb),'message','More than one active repair matched. Choose the correct Job Card.');
  end if;

  with candidates as (
    select j.id,
      (j.status not in ('closed','cancelled')) as active,
      case
        when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 1000
        when j.imei is not null and length(v_digits)>=10 and regexp_replace(j.imei,'[^0-9]','','g')=v_digits then 980
        when j.serial_number is not null and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')=v_norm then 960
        when j.imei is not null and length(regexp_replace(j.imei,'[^0-9]','','g'))>=10 and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits)>0 then 930
        when j.serial_number is not null and length(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g'))>=5 and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm)>0 then 900
        when j.brand is not null and j.model is not null and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g')=v_norm then 850
        when j.model is not null and regexp_replace(upper(j.model),'[^A-Z0-9]','','g')=v_norm then 800
        when j.model is not null and length(regexp_replace(upper(j.model),'[^A-Z0-9]','','g'))>=4 and (position(regexp_replace(upper(j.model),'[^A-Z0-9]','','g') in v_norm)>0 or position(v_norm in regexp_replace(upper(j.model),'[^A-Z0-9]','','g'))>0) then 650
        else 0 end as score,
      case
        when regexp_replace(upper(j.job_number),'[^A-Z0-9]','','g') = v_norm then 'job_number'
        when j.imei is not null and length(v_digits)>=10 and regexp_replace(j.imei,'[^0-9]','','g')=v_digits then 'imei'
        when j.serial_number is not null and regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g')=v_norm then 'serial_number'
        when j.imei is not null and position(regexp_replace(j.imei,'[^0-9]','','g') in v_digits)>0 then 'embedded_imei'
        when j.serial_number is not null and position(regexp_replace(upper(j.serial_number),'[^A-Z0-9]','','g') in v_norm)>0 then 'embedded_serial'
        when j.brand is not null and j.model is not null and regexp_replace(upper(coalesce(j.brand,'')||coalesce(j.model,'')),'[^A-Z0-9]','','g')=v_norm then 'brand_model'
        else 'model' end as match_type,
      j.updated_at
    from public.service_job j
    where j.company_id=v_company_id and j.branch_id=v_device.branch_id
  )
  select id, match_type into v_job_id, v_match
  from candidates
  where score>=650
  order by active desc, score desc, updated_at desc
  limit 1;

  select jsonb_build_object(
    'ok',true,'found',true,'ambiguous',false,'match_type',v_match,'confidence',v_top_score,
    'job',jsonb_build_object(
      'id',j.id,'job_number',j.job_number,'status',j.status,'customer_name',c.customer_name,
      'device_type',j.device_type,'brand',j.brand,'model',j.model,'serial_number',j.serial_number,'imei',j.imei,
      'reported_fault',j.reported_fault,
      'assigned_employee',nullif(btrim(concat_ws(' ',e.first_name,e.last_name)),''),
      'intake_confirmed',j.intake_confirmed_at is not null,'approved_amount',j.approved_amount,
      'repair_started_at',j.repair_started_at,'invoice_number',i.invoice_number,'balance_due',i.balance_due
    )
  ) into v_result
  from public.service_job j
  join public.customer c on c.id=j.customer_id and c.company_id=j.company_id
  left join public.hr_employee e on e.id=j.assigned_employee_id and e.company_id=j.company_id
  left join public.invoice i on i.id=j.invoice_id and i.company_id=j.company_id
  where j.id=v_job_id and j.company_id=v_company_id;

  update public.service_scanner_device set last_seen_at=now(), updated_at=now() where id=v_device.id;
  insert into public.service_job_scan(company_id,branch_id,scanner_device_id,service_job_id,scanned_value,match_type,scan_action,user_id,employee_id,metadata)
  values(v_company_id,v_device.branch_id,v_device.id,v_job_id,v_raw,v_match,'lookup',auth.uid(),v_employee_id,jsonb_build_object('engine','smart_v1','confidence',v_top_score));

  return v_result;
end;
$$;

revoke all on function public.smart_identify_service_job(uuid,text) from public, anon;
grant execute on function public.smart_identify_service_job(uuid,text) to authenticated;;
