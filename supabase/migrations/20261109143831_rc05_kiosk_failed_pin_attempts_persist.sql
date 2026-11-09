
DO $patch$
DECLARE olddef text; newdef text;
DECLARE needle text := 'raise exception ''Invalid employee code or PIN.'';';
DECLARE replacement text := 'return jsonb_build_object(''ok'',false,''reason'',''invalid_credentials'',''message'',''Invalid employee code or PIN.'');';
DECLARE occurrences integer;
BEGIN
 SELECT pg_get_functiondef('public.kiosk_clock_hr_employee(uuid,text,text,text,text)'::regprocedure) INTO olddef;
 IF olddef IS NULL THEN RAISE EXCEPTION 'Kiosk function missing'; END IF;
 occurrences := (length(olddef)-length(replace(olddef,needle,'')))/length(needle);
 IF occurrences<>2 THEN RAISE EXCEPTION 'Unexpected failed credential branches: %',occurrences; END IF;
 newdef:=replace(olddef,needle,replacement);
 EXECUTE newdef;
END $patch$;
DO $verify$
DECLARE content text; n integer;
BEGIN
 SELECT pg_get_functiondef('public.kiosk_clock_hr_employee(uuid,text,text,text,text)'::regprocedure) INTO content;
 n:=(length(content)-length(replace(content,'invalid_credentials','')))/length('invalid_credentials');
 IF n<>2 THEN RAISE EXCEPTION 'Expected two invalid credential returns, found %',n; END IF;
END $verify$;;
