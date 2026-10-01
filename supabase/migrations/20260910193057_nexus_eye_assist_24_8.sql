create or replace function public.nexus_eye_assist(
  p_device_type text default null,
  p_brand text default null,
  p_model text default null,
  p_serial_number text default null,
  p_imei text default null,
  p_fault text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_company_id uuid;
  v_search text;
  v_identity jsonb := '[]'::jsonb;
  v_architecture text := null;
  v_architecture_confidence text := 'low';
  v_fault text := lower(coalesce(p_fault,''));
  v_steps jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not (
    public.current_user_has_permission('repair.create')
    or public.current_user_has_permission('repair.view')
    or public.current_user_has_permission('repair.update')
  ) then
    raise exception 'Permission denied: repairs';
  end if;

  v_company_id := public.current_company_id();

  v_search := coalesce(
    nullif(btrim(coalesce(p_imei,'')),''),
    nullif(btrim(coalesce(p_serial_number,'')),''),
    nullif(btrim(concat_ws(' ',nullif(btrim(coalesce(p_brand,'')),''),nullif(btrim(coalesce(p_model,'')),''))),''),
    nullif(btrim(coalesce(p_model,'')),''),
    nullif(btrim(coalesce(p_brand,'')),''),
    nullif(btrim(coalesce(p_device_type,'')),'')
  );

  if v_search is not null then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.confidence desc, s.occurrences desc), '[]'::jsonb)
    into v_identity
    from public.suggest_service_device_identity(v_search, 6) s;
  end if;

  if upper(coalesce(p_model,'')) = 'A1502' then
    v_architecture := 'Intel x86-64 MacBook Pro Retina 13-inch A1502 family';
    v_architecture_confidence := 'high';
  elsif lower(coalesce(p_brand,'')) = 'apple' and lower(coalesce(p_device_type,'')) in ('phone','smartphone','tablet','ipad','iphone') then
    v_architecture := 'Apple ARM-family architecture; exact SoC requires exact model identifier';
    v_architecture_confidence := 'medium';
  elsif upper(coalesce(p_model,'')) like 'SM-%' or lower(coalesce(p_brand,'')) = 'samsung' then
    v_architecture := 'Likely ARM-family mobile architecture; verify exact model/SoC';
    v_architecture_confidence := 'medium';
  elsif lower(coalesce(p_device_type,'')) in ('laptop','desktop','computer','pc') and lower(coalesce(p_brand,'')) in ('dell','hp','lenovo','acer','asus','toshiba') then
    v_architecture := 'Likely x86-64 PC architecture; verify exact CPU/model';
    v_architecture_confidence := 'medium';
  end if;

  if v_fault ~ '(liquid|water|wet|corrosion)' then
    v_warnings := v_warnings || jsonb_build_array('Do not keep powering the device until liquid/corrosion inspection is complete.');
    v_steps := v_steps || jsonb_build_array(
      'Disconnect external power and battery where safe.',
      'Inspect for liquid indicators, corrosion and residue.',
      'Photograph affected areas before cleaning.',
      'Clean/repair corrosion before powered testing.'
    );
  end if;

  if v_fault ~ '(no display|black screen|blank screen|no picture|backlight)' then
    v_steps := v_steps || jsonb_build_array(
      'Confirm the device is actually powering/booting.',
      'Test brightness/backlight and use a flashlight test where applicable.',
      'Test an external display where supported.',
      'Inspect display cable/connector and visible damage.',
      'Only then move to board-level display/backlight power checks.'
    );
  end if;

  if v_fault ~ '(not charging|no charge|charging|charger|usb.?c|dc jack)' then
    v_steps := v_steps || jsonb_build_array(
      'Test with a known-good compatible charger/cable.',
      'Inspect and clean the charging port.',
      'Check battery condition/voltage where appropriate.',
      'Measure charging current or adapter draw if tools are available.',
      'Inspect charging board/flex/DC-in path before board-level IC diagnosis.'
    );
  end if;

  if v_fault ~ '(no power|dead|not turning on|won.t turn on|doesn.t turn on)' then
    v_steps := v_steps || jsonb_build_array(
      'Verify adapter/charger output with a known-good source.',
      'Inspect power connector and battery state.',
      'Perform a safe power reset/battery disconnect where applicable.',
      'Check for obvious shorts, heat or damaged components before repeated power attempts.',
      'Proceed to board power-rail diagnosis only after basic checks.'
    );
  end if;

  if v_fault ~ '(overheat|hot|fan|thermal)' then
    v_steps := v_steps || jsonb_build_array(
      'Inspect vents/fans for blockage and dust.',
      'Confirm fan operation and temperatures.',
      'Inspect heatsink contact and thermal interface condition.',
      'Check abnormal CPU/GPU load before hardware replacement.'
    );
  end if;

  if v_fault ~ '(hinge|broken hinge)' then
    v_steps := v_steps || jsonb_build_array(
      'Inspect hinge mounts and chassis damage.',
      'Check display cable routing for pinch/damage.',
      'Do not force the lid until mechanical damage is assessed.'
    );
  end if;

  if jsonb_array_length(v_steps) = 0 then
    v_steps := jsonb_build_array(
      'Confirm the reported symptom.',
      'Inspect the device externally and record visible condition.',
      'Check power, cables and obvious physical causes first.',
      'Use model-specific tests only after the basic checks.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'engine', 'nexus_eye_v1',
    'company_id', v_company_id,
    'identity_suggestions', v_identity,
    'architecture_hint', v_architecture,
    'architecture_confidence', v_architecture_confidence,
    'colour_hint', null,
    'colour_note', 'Colour requires visual analysis from an image; do not infer it from model history.',
    'diagnostic_steps', v_steps,
    'warnings', v_warnings,
    'note', 'Suggestions assist the technician; confirm measurements and physical findings before diagnosis.'
  );
end;
$function$;

revoke all on function public.nexus_eye_assist(text,text,text,text,text,text) from public;
revoke all on function public.nexus_eye_assist(text,text,text,text,text,text) from anon;
grant execute on function public.nexus_eye_assist(text,text,text,text,text,text) to authenticated;;
