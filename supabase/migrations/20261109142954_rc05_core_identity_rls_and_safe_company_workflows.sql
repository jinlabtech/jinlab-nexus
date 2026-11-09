
DO $guard$
BEGIN
 IF to_regclass('public.company') IS NULL OR to_regclass('public.branch') IS NULL OR to_regclass('public.user_profile') IS NULL THEN
  RAISE EXCEPTION 'RC05: Core tables missing';
 END IF;
 IF to_regprocedure('public.current_company_id()') IS NULL OR to_regprocedure('public.current_user_has_permission(text)') IS NULL OR to_regprocedure('public.user_has_effective_permission(uuid,uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'RC05: Permission functions missing';
 END IF;
 IF EXISTS (
  SELECT 1 FROM pg_class WHERE oid IN ('public.company'::regclass,'public.branch'::regclass,'public.user_profile'::regclass) AND relrowsecurity
 ) THEN RAISE EXCEPTION 'RC05: Unexpected existing RLS state; review first'; END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('company','branch','user_profile')) THEN
  RAISE EXCEPTION 'RC05: Existing policies require review';
 END IF;
 IF to_regprocedure('public.provision_company(text,text,text,text)') IS NOT NULL OR to_regprocedure('public.owner_update_company_user(uuid,uuid,text,text)') IS NOT NULL OR to_regprocedure('public.complete_company_invitation(uuid,uuid,text,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'RC05: One or more RPCs already exist';
 END IF;
 IF EXISTS (SELECT user_id FROM public.user_profile GROUP BY user_id HAVING count(*) > 1) THEN
  RAISE EXCEPTION 'RC05: Duplicate user_profile user_id; identity resolution unsafe';
 END IF;
END
$guard$;

CREATE FUNCTION public.provision_company(
 p_company_name text,
 p_registration_number text DEFAULT NULL,
 p_email text DEFAULT NULL,
 p_phone text DEFAULT NULL
)
RETURNS SETOF public.company
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
 v_uid uuid := auth.uid();
 v_profile public.user_profile%ROWTYPE;
 v_company public.company%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO v_profile FROM public.user_profile WHERE user_id = v_uid FOR UPDATE;
 IF NOT FOUND OR v_profile.company_id IS NOT NULL OR v_profile.role IS DISTINCT FROM 'owner' THEN
  RAISE EXCEPTION 'Company provisioning requires an unassigned owner account';
 END IF;
 IF nullif(btrim(p_company_name),'') IS NULL OR length(btrim(p_company_name)) > 200 THEN
  RAISE EXCEPTION 'Invalid company name';
 END IF;
 INSERT INTO public.company(company_name, registration_number, email, phone)
 VALUES (btrim(p_company_name),nullif(btrim(p_registration_number),''),nullif(btrim(p_email),''),nullif(btrim(p_phone),''))
 RETURNING * INTO v_company;
 UPDATE public.user_profile SET company_id = v_company.id WHERE id = v_profile.id AND company_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company assignment failed'; END IF;
 RETURN NEXT v_company;
END
$body$;

CREATE FUNCTION public.owner_update_company_user(
 p_profile_id uuid, p_company_id uuid, p_full_name text, p_role text
)
RETURNS SETOF public.user_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
 v_actor public.user_profile%ROWTYPE;
 v_target public.user_profile%ROWTYPE;
 v_changed public.user_profile%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_company_id IS NULL OR p_profile_id IS NULL THEN
  RAISE EXCEPTION 'Authentication and company required';
 END IF;
 SELECT * INTO v_actor FROM public.user_profile WHERE user_id=auth.uid() AND company_id=p_company_id LIMIT 1;
 IF NOT FOUND OR v_actor.role NOT IN ('owner','admin') OR NOT public.current_user_has_permission('user.update') THEN
  RAISE EXCEPTION 'User management denied';
 END IF;
 IF p_role IS NULL OR p_role NOT IN ('owner','admin','manager','technician','cashier','employee','viewer') THEN
  RAISE EXCEPTION 'Invalid role';
 END IF;
 IF nullif(btrim(p_full_name),'') IS NULL OR length(btrim(p_full_name)) > 120 THEN
  RAISE EXCEPTION 'Invalid name';
 END IF;
 SELECT * INTO v_target FROM public.user_profile WHERE id=p_profile_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company user not found'; END IF;
 IF (v_target.role='owner' OR p_role='owner') AND v_actor.role <> 'owner' THEN
  RAISE EXCEPTION 'Only owners may manage owners';
 END IF;
 IF v_target.user_id=auth.uid() AND p_role IS DISTINCT FROM v_target.role THEN
  RAISE EXCEPTION 'Cannot change your own role';
 END IF;
 IF v_target.role='owner' AND p_role<>'owner' AND
   (SELECT count(*) FROM public.user_profile WHERE company_id=p_company_id AND role='owner') <= 1 THEN
  RAISE EXCEPTION 'Cannot remove last owner';
 END IF;
 UPDATE public.user_profile SET full_name=btrim(p_full_name),role=p_role WHERE id=p_profile_id AND company_id=p_company_id RETURNING * INTO v_changed;
 RETURN NEXT v_changed;
END
$body$;

CREATE FUNCTION public.complete_company_invitation(
 p_actor_user_id uuid, p_invited_user_id uuid, p_full_name text, p_role text
)
RETURNS SETOF public.user_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
 v_actor public.user_profile%ROWTYPE;
 v_invited public.user_profile%ROWTYPE;
 v_changed public.user_profile%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' THEN
  RAISE EXCEPTION 'Service role required';
 END IF;
 IF p_actor_user_id IS NULL OR p_invited_user_id IS NULL OR p_actor_user_id=p_invited_user_id THEN
  RAISE EXCEPTION 'Invalid invitation identities';
 END IF;
 SELECT * INTO v_actor FROM public.user_profile WHERE user_id=p_actor_user_id AND company_id IS NOT NULL LIMIT 1;
 IF NOT FOUND OR v_actor.role NOT IN ('owner','admin') OR
  NOT public.user_has_effective_permission(v_actor.user_id,v_actor.company_id,'user.invite') THEN
  RAISE EXCEPTION 'Invitation permission denied';
 END IF;
 IF p_role NOT IN ('owner','admin','manager','technician','cashier','employee','viewer') THEN
  RAISE EXCEPTION 'Invalid invited role';
 END IF;
 IF p_role='owner' AND v_actor.role<>'owner' THEN
  RAISE EXCEPTION 'Only owner may invite owner';
 END IF;
 IF nullif(btrim(p_full_name),'') IS NULL OR length(btrim(p_full_name)) > 120 THEN
  RAISE EXCEPTION 'Invalid invitee name';
 END IF;
 SELECT * INTO v_invited FROM public.user_profile WHERE user_id=p_invited_user_id FOR UPDATE;
 IF NOT FOUND OR v_invited.company_id IS NOT NULL THEN
  RAISE EXCEPTION 'Invitee profile missing or already assigned';
 END IF;
 UPDATE public.user_profile SET company_id=v_actor.company_id, full_name=btrim(p_full_name),role=p_role
 WHERE id=v_invited.id AND company_id IS NULL RETURNING * INTO v_changed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation assignment failed'; END IF;
 RETURN NEXT v_changed;
END
$body$;

REVOKE ALL ON FUNCTION public.provision_company(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_company(text,text,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.owner_update_company_user(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_company_user(uuid,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_company_invitation(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_company_invitation(uuid,uuid,text,text) TO service_role;

REVOKE ALL ON public.company, public.branch, public.user_profile FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.company, public.branch, public.user_profile TO authenticated;
GRANT UPDATE (company_name,registration_number,email,phone,address,trading_name,physical_address,vat_registered,vat_number,logo_path,website,document_footer)
 ON public.company TO authenticated;
GRANT INSERT (company_id,branch_name,address) ON public.branch TO authenticated;
GRANT UPDATE (branch_name,address) ON public.branch TO authenticated;
GRANT DELETE ON public.branch TO authenticated;

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RC05 company own read" ON public.company FOR SELECT TO authenticated
 USING (id = (SELECT public.current_company_id()));
CREATE POLICY "RC05 company permitted update" ON public.company FOR UPDATE TO authenticated
 USING (id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('company.update')))
 WITH CHECK (id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('company.update')));

CREATE POLICY "RC05 branch company read" ON public.branch FOR SELECT TO authenticated
 USING (company_id = (SELECT public.current_company_id()));
CREATE POLICY "RC05 branch permitted insert" ON public.branch FOR INSERT TO authenticated
 WITH CHECK (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('branch.create')));
CREATE POLICY "RC05 branch permitted update" ON public.branch FOR UPDATE TO authenticated
 USING (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('branch.update')))
 WITH CHECK (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('branch.update')));
CREATE POLICY "RC05 branch permitted delete" ON public.branch FOR DELETE TO authenticated
 USING (company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('branch.delete')));

CREATE POLICY "RC05 profile self and company team read" ON public.user_profile FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (
 company_id=(SELECT public.current_company_id()) AND (SELECT public.current_user_has_permission('user.view'))
 ));

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_user_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_effective_permission(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_effective_permission(uuid,uuid,text) TO authenticated, service_role;

DO $check$
BEGIN
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.company'::regclass,'public.branch'::regclass,'public.user_profile'::regclass) AND relrowsecurity)<>3 THEN
  RAISE EXCEPTION 'RC05: RLS verification failed';
 END IF;
 IF has_table_privilege('anon','public.company','SELECT') OR has_table_privilege('anon','public.branch','SELECT') OR has_table_privilege('anon','public.user_profile','SELECT') THEN
  RAISE EXCEPTION 'RC05: Anonymous direct grants remain';
 END IF;
 IF has_table_privilege('authenticated','public.user_profile','UPDATE') OR has_table_privilege('authenticated','public.user_profile','INSERT') OR has_table_privilege('authenticated','public.company','INSERT') THEN
  RAISE EXCEPTION 'RC05: Unsafe direct write grant remains';
 END IF;
 IF NOT has_table_privilege('service_role','public.user_profile','UPDATE') OR NOT has_table_privilege('service_role','public.company','INSERT') THEN
  RAISE EXCEPTION 'RC05: Server service role privileges missing';
 END IF;
END
$check$;;
