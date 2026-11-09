CREATE OR REPLACE FUNCTION public.complete_company_invitation(
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
 -- The EXECUTE grant is restricted to service_role. Inside SECURITY DEFINER,
 -- current_user is the function owner, so checking current_user here is incorrect.
 IF p_actor_user_id IS NULL OR p_invited_user_id IS NULL OR p_actor_user_id=p_invited_user_id THEN
  RAISE EXCEPTION 'Invalid invitation identities';
 END IF;
 SELECT * INTO v_actor FROM public.user_profile
 WHERE user_id=p_actor_user_id AND company_id IS NOT NULL LIMIT 1;
 IF NOT FOUND OR v_actor.role NOT IN ('owner','admin') OR
  NOT public.user_has_effective_permission(v_actor.user_id,v_actor.company_id,'user.invite') THEN
  RAISE EXCEPTION 'Invitation permission denied';
 END IF;
 IF p_role IS NULL OR p_role NOT IN ('owner','admin','manager','technician','cashier','employee','viewer') THEN
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
REVOKE ALL ON FUNCTION public.complete_company_invitation(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_company_invitation(uuid,uuid,text,text) TO service_role;
DO $check$
BEGIN
 IF has_function_privilege('anon','public.complete_company_invitation(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.complete_company_invitation(uuid,uuid,text,text)','EXECUTE') OR NOT has_function_privilege('service_role','public.complete_company_invitation(uuid,uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Invitation access grant is not service-role-only';
 END IF;
END $check$;;
