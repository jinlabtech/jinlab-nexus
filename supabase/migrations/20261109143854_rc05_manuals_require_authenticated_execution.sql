REVOKE EXECUTE ON FUNCTION public.authorize_nexus_manual_download(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_available_nexus_manuals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_nexus_manual_download(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_available_nexus_manuals() TO authenticated,service_role;
DO $check$
BEGIN
 IF has_function_privilege('anon','public.authorize_nexus_manual_download(text)','EXECUTE')
 OR has_function_privilege('anon','public.get_available_nexus_manuals()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.get_available_nexus_manuals()','EXECUTE')
 THEN RAISE EXCEPTION 'Manual access restriction failed'; END IF;
END $check$;;
