create extension if not exists pg_trgm with schema extensions;

create or replace function public.smart_find_service_jobs(
  p_value text,
  p_limit integer default 8
)
returns table(
  id uuid,
  job_number text,
  status text,
  customer_name text,
  device_type text,
  brand text,
  model text,
  serial_number text,
  imei text,
  reported_fault text,
  assigned_employee text,
  match_type text,
  confidence integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_raw text;
  v_norm text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not (
    public.current_user_has_permission('repair.view')
    or public.current_user_has_permission('repair.scanner.use')
  ) then
    raise exception 'Permission denied: repair.view';
  end if;

  v_company_id := public.current_company_id();
  v_raw := btrim(coalesce(p_value, ''));
  v_norm := regexp_replace(lower(v_raw), '[^a-z0-9]+', '', 'g');

  if v_norm = '' then
    raise exception 'Scan/search value is required.';
  end if;

  return query
  with ranked as (
    select
      j.id,
      j.job_number,
      j.status,
      c.customer_name,
      j.device_type,
      j.brand,
      j.model,
      j.serial_number,
      j.imei,
      j.reported_fault,
      nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), '') as assigned_employee,
      case
        when lower(btrim(j.job_number)) = lower(v_raw) then 'job_number'
        when j.imei is not null and regexp_replace(lower(j.imei), '[^a-z0-9]+', '', 'g') = v_norm then 'imei'
        when j.serial_number is not null and regexp_replace(lower(j.serial_number), '[^a-z0-9]+', '', 'g') = v_norm then 'serial_number'
        when j.model is not null and regexp_replace(lower(j.model), '[^a-z0-9]+', '', 'g') = v_norm then 'model'
        when regexp_replace(lower(concat_ws('', j.brand, j.model)), '[^a-z0-9]+', '', 'g') = v_norm then 'brand_model'
        when j.serial_number is not null and extensions.similarity(lower(j.serial_number), lower(v_raw)) >= 0.45 then 'serial_similar'
        when j.model is not null and extensions.similarity(lower(j.model), lower(v_raw)) >= 0.40 then 'model_similar'
        when extensions.similarity(lower(concat_ws(' ', j.brand, j.model)), lower(v_raw)) >= 0.40 then 'brand_model_similar'
        else 'text_match'
      end as match_type,
      greatest(
        case when lower(btrim(j.job_number)) = lower(v_raw) then 100 else 0 end,
        case when j.imei is not null and regexp_replace(lower(j.imei), '[^a-z0-9]+', '', 'g') = v_norm then 100 else 0 end,
        case when j.serial_number is not null and regexp_replace(lower(j.serial_number), '[^a-z0-9]+', '', 'g') = v_norm then 99 else 0 end,
        case when regexp_replace(lower(concat_ws('', j.brand, j.model)), '[^a-z0-9]+', '', 'g') = v_norm then 96 else 0 end,
        case when j.model is not null and regexp_replace(lower(j.model), '[^a-z0-9]+', '', 'g') = v_norm then 94 else 0 end,
        case when j.serial_number is not null then round(90 * extensions.similarity(lower(j.serial_number), lower(v_raw)))::int else 0 end,
        case when j.model is not null then round(85 * extensions.similarity(lower(j.model), lower(v_raw)))::int else 0 end,
        round(88 * extensions.similarity(lower(concat_ws(' ', j.brand, j.model)), lower(v_raw)))::int,
        case when coalesce(j.serial_number,'') ilike '%' || v_raw || '%' then 72 else 0 end,
        case when coalesce(j.model,'') ilike '%' || v_raw || '%' then 70 else 0 end,
        case when coalesce(j.brand,'') ilike '%' || v_raw || '%' then 58 else 0 end,
        case when c.customer_name ilike '%' || v_raw || '%' then 45 else 0 end
      ) as confidence
    from public.service_job j
    join public.customer c
      on c.id = j.customer_id and c.company_id = j.company_id
    left join public.hr_employee e
      on e.id = j.assigned_employee_id and e.company_id = j.company_id
    where j.company_id = v_company_id
      and j.status not in ('cancelled')
      and (
        lower(btrim(j.job_number)) = lower(v_raw)
        or (j.imei is not null and regexp_replace(lower(j.imei), '[^a-z0-9]+', '', 'g') = v_norm)
        or (j.serial_number is not null and regexp_replace(lower(j.serial_number), '[^a-z0-9]+', '', 'g') = v_norm)
        or (j.model is not null and regexp_replace(lower(j.model), '[^a-z0-9]+', '', 'g') = v_norm)
        or regexp_replace(lower(concat_ws('', j.brand, j.model)), '[^a-z0-9]+', '', 'g') = v_norm
        or (j.serial_number is not null and extensions.similarity(lower(j.serial_number), lower(v_raw)) >= 0.45)
        or (j.model is not null and extensions.similarity(lower(j.model), lower(v_raw)) >= 0.40)
        or extensions.similarity(lower(concat_ws(' ', j.brand, j.model)), lower(v_raw)) >= 0.40
        or coalesce(j.serial_number,'') ilike '%' || v_raw || '%'
        or coalesce(j.model,'') ilike '%' || v_raw || '%'
        or coalesce(j.brand,'') ilike '%' || v_raw || '%'
        or c.customer_name ilike '%' || v_raw || '%'
      )
  )
  select
    r.id,
    r.job_number,
    r.status,
    r.customer_name,
    r.device_type,
    r.brand,
    r.model,
    r.serial_number,
    r.imei,
    r.reported_fault,
    r.assigned_employee,
    r.match_type,
    r.confidence
  from ranked r
  where r.confidence >= 40
  order by r.confidence desc, r.job_number desc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;

create or replace function public.smart_identify_service_job(p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidates jsonb;
  v_count integer;
  v_top jsonb;
  v_top_type text;
  v_top_conf integer;
  v_same_top integer;
  v_auto boolean := false;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.confidence desc, x.job_number desc), '[]'::jsonb), count(*)
  into v_candidates, v_count
  from public.smart_find_service_jobs(p_value, 8) x;

  if v_count = 0 then
    return jsonb_build_object(
      'ok', true,
      'found', false,
      'auto_open', false,
      'candidates', '[]'::jsonb,
      'message', 'No matching Job Card, IMEI, serial number or model was found.'
    );
  end if;

  v_top := v_candidates->0;
  v_top_type := v_top->>'match_type';
  v_top_conf := coalesce((v_top->>'confidence')::integer, 0);

  select count(*) into v_same_top
  from public.smart_find_service_jobs(p_value, 8) x
  where x.confidence = v_top_conf;

  v_auto :=
    (v_top_type in ('job_number','imei','serial_number') and v_top_conf >= 99)
    or (v_top_type in ('brand_model','model') and v_top_conf >= 94 and v_same_top = 1)
    or (v_count = 1 and v_top_conf >= 88);

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'auto_open', v_auto,
    'selected_job_number', case when v_auto then v_top->>'job_number' else null end,
    'match_type', v_top_type,
    'confidence', v_top_conf,
    'candidates', v_candidates,
    'message', case
      when v_auto then 'Device identified.'
      else 'Multiple or lower-confidence matches found. Choose the correct Job Card.'
    end
  );
end;
$$;

revoke all on function public.smart_find_service_jobs(text, integer) from public, anon;
revoke all on function public.smart_identify_service_job(text) from public, anon;
grant execute on function public.smart_find_service_jobs(text, integer) to authenticated;
grant execute on function public.smart_identify_service_job(text) to authenticated;;
