
DO $gate$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.prosecdef AND p.prorettype <> 'pg_catalog.trigger'::regtype
 AND has_function_privilege('anon',p.oid,'EXECUTE');
 IF n<100 OR n>250 THEN
  RAISE EXCEPTION 'Unexpected anonymous privileged RPC count: %',n;
 END IF;
END $gate$;

DO $revoke$
DECLARE f record; sig text;
BEGIN
 FOR f IN
  SELECT p.oid,p.proname,ns.nspname
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.prosecdef
   AND p.prorettype <> 'pg_catalog.trigger'::regtype
   AND has_function_privilege('anon',p.oid,'EXECUTE')
   AND p.proname NOT IN (
    'get_public_quotation','respond_to_public_quotation',
    'get_public_payment_link','create_public_gateway_transaction',
    'get_available_nexus_manuals','authorize_nexus_manual_download',
    'kiosk_get_device_info','kiosk_clock_hr_employee'
   )
 LOOP
  SELECT pg_catalog.format('%I.%I(%s)',f.nspname,f.proname,
   pg_get_function_identity_arguments(f.oid)) INTO sig;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION '||sig||' FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||sig||' TO authenticated, service_role';
 END LOOP;
END $revoke$;

DO $verify$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.prosecdef AND p.prorettype <> 'pg_catalog.trigger'::regtype
 AND has_function_privilege('anon',p.oid,'EXECUTE')
 AND p.proname NOT IN (
    'get_public_quotation','respond_to_public_quotation',
    'get_public_payment_link','create_public_gateway_transaction',
    'get_available_nexus_manuals','authorize_nexus_manual_download',
    'kiosk_get_device_info','kiosk_clock_hr_employee'
 );
 IF n<>0 THEN RAISE EXCEPTION 'Anon privileged RPCs still exposed: %',n; END IF;
 IF NOT has_function_privilege('anon','public.get_public_quotation(text)','EXECUTE') OR
 NOT has_function_privilege('anon','public.get_public_payment_link(text)','EXECUTE') THEN
  RAISE EXCEPTION 'Required public token endpoints lost access';
 END IF;
END $verify$;
;
