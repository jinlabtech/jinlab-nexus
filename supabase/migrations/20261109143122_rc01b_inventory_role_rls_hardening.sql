DO $guard$
BEGIN
 IF to_regclass('public.inventory_item') IS NULL
 OR to_regprocedure('public.current_company_id()') IS NULL
 OR to_regprocedure('public.current_user_has_permission(text)') IS NULL
 THEN RAISE EXCEPTION 'RC01B: Required schema objects missing'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.inventory_item'::regclass)
 THEN RAISE EXCEPTION 'RC01B: Inventory RLS disabled'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='inventory_item') <> 4
 OR (SELECT count(*) FROM pg_policies
 WHERE schemaname='public' AND tablename='inventory_item'
 AND policyname IN ('Users can create company inventory items','Users can update company inventory items','Users can delete company inventory items')) <> 3
 THEN RAISE EXCEPTION 'RC01B: Unexpected inventory policies'; END IF;
END $guard$;
ALTER POLICY "Users can create company inventory items" ON public.inventory_item WITH CHECK (
 company_id=(SELECT public.current_company_id()) AND
 (SELECT public.current_user_has_permission('inventory.create'))
);
ALTER POLICY "Users can update company inventory items" ON public.inventory_item
USING (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('inventory.update')))
WITH CHECK (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('inventory.update')));
ALTER POLICY "Users can delete company inventory items" ON public.inventory_item USING (
 company_id=(SELECT public.current_company_id()) AND
 (SELECT public.current_user_has_permission('inventory.delete'))
);
DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='inventory_item' AND cmd IN ('INSERT','UPDATE','DELETE') AND (COALESCE(qual,'') LIKE '%current_user_has_permission%' OR COALESCE(with_check,'') LIKE '%current_user_has_permission%'))<>3
 THEN RAISE EXCEPTION 'RC01B: role-based inventory policies did not activate'; END IF;
END $verify$;;
