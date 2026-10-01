create or replace function public.suggest_service_device_identity(
  p_value text,
  p_limit integer default 6
)
returns table(
  device_type text,
  brand text,
  model text,
  serial_number text,
  imei text,
  match_type text,
  confidence integer,
  occurrences integer,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_company_id uuid;
  v_raw text;
  v_norm text;
  v_digits text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not (
    public.current_user_has_permission('repair.create')
    or public.current_user_has_permission('repair.view')
  ) then
    raise exception 'Permission denied: repair.create';
  end if;

  v_company_id := public.current_company_id();
  v_raw := btrim(coalesce(p_value,''));
  v_norm := regexp_replace(lower(v_raw), '[^a-z0-9]+', '', 'g');
  v_digits := regexp_replace(v_raw, '[^0-9]+', '', 'g');

  if v_norm = '' then
    return;
  end if;

  return query
  with ranked as (
    select
      j.device_type,
      j.brand,
      j.model,
      j.serial_number,
      j.imei,
      j.updated_at,
      case
        when j.imei is not null and length(v_digits) >= 10
             and regexp_replace(j.imei,'[^0-9]+','','g') = v_digits then 'imei'
        when j.serial_number is not null
             and regexp_replace(lower(j.serial_number),'[^a-z0-9]+','','g') = v_norm then 'serial_number'
        when j.brand is not null and j.model is not null
             and regexp_replace(lower(j.brand || j.model),'[^a-z0-9]+','','g') = v_norm then 'brand_model'
        when j.model is not null
             and regexp_replace(lower(j.model),'[^a-z0-9]+','','g') = v_norm then 'model'
        when j.serial_number is not null and extensions.similarity(lower(j.serial_number), lower(v_raw)) >= 0.45 then 'serial_similar'
        when j.model is not null and extensions.similarity(lower(j.model), lower(v_raw)) >= 0.40 then 'model_similar'
        when j.brand is not null and extensions.similarity(lower(j.brand), lower(v_raw)) >= 0.45 then 'brand_similar'
        else 'partial'
      end as match_type,
      greatest(
        case when j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]+','','g') = v_digits then 100 else 0 end,
        case when j.serial_number is not null and regexp_replace(lower(j.serial_number),'[^a-z0-9]+','','g') = v_norm then 99 else 0 end,
        case when j.brand is not null and j.model is not null and regexp_replace(lower(j.brand || j.model),'[^a-z0-9]+','','g') = v_norm then 97 else 0 end,
        case when j.model is not null and regexp_replace(lower(j.model),'[^a-z0-9]+','','g') = v_norm then 95 else 0 end,
        case when j.serial_number is not null then round(90 * extensions.similarity(lower(j.serial_number), lower(v_raw)))::int else 0 end,
        case when j.model is not null then round(85 * extensions.similarity(lower(j.model), lower(v_raw)))::int else 0 end,
        case when j.brand is not null then round(75 * extensions.similarity(lower(j.brand), lower(v_raw)))::int else 0 end,
        case when coalesce(j.serial_number,'') ilike '%' || v_raw || '%' then 72 else 0 end,
        case when coalesce(j.model,'') ilike '%' || v_raw || '%' then 70 else 0 end,
        case when coalesce(j.brand,'') ilike '%' || v_raw || '%' then 60 else 0 end
      ) as confidence
    from public.service_job j
    where j.company_id = v_company_id
      and j.status <> 'cancelled'
      and (
        (j.imei is not null and length(v_digits) >= 10 and regexp_replace(j.imei,'[^0-9]+','','g') = v_digits)
        or (j.serial_number is not null and regexp_replace(lower(j.serial_number),'[^a-z0-9]+','','g') = v_norm)
        or (j.brand is not null and j.model is not null and regexp_replace(lower(j.brand || j.model),'[^a-z0-9]+','','g') = v_norm)
        or (j.model is not null and regexp_replace(lower(j.model),'[^a-z0-9]+','','g') = v_norm)
        or (j.serial_number is not null and extensions.similarity(lower(j.serial_number), lower(v_raw)) >= 0.45)
        or (j.model is not null and extensions.similarity(lower(j.model), lower(v_raw)) >= 0.40)
        or (j.brand is not null and extensions.similarity(lower(j.brand), lower(v_raw)) >= 0.45)
        or coalesce(j.serial_number,'') ilike '%' || v_raw || '%'
        or coalesce(j.model,'') ilike '%' || v_raw || '%'
        or coalesce(j.brand,'') ilike '%' || v_raw || '%'
      )
  ), grouped as (
    select
      r.device_type,
      r.brand,
      r.model,
      r.serial_number,
      r.imei,
      (array_agg(r.match_type order by r.confidence desc, r.updated_at desc))[1] as match_type,
      max(r.confidence)::int as confidence,
      count(*)::int as occurrences,
      max(r.updated_at) as last_seen_at
    from ranked r
    where r.confidence >= 40
    group by r.device_type,r.brand,r.model,r.serial_number,r.imei
  )
  select
    g.device_type,g.brand,g.model,g.serial_number,g.imei,
    g.match_type,g.confidence,g.occurrences,g.last_seen_at
  from grouped g
  order by g.confidence desc, g.occurrences desc, g.last_seen_at desc
  limit greatest(1, least(coalesce(p_limit,6), 12));
end;
$function$;

revoke all on function public.suggest_service_device_identity(text,integer) from public, anon;
grant execute on function public.suggest_service_device_identity(text,integer) to authenticated;;
