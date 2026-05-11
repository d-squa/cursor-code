-- Extra INSERT paths for user_roles: explicit SECURITY DEFINER checks avoid edge cases
-- where FOR ALL + nested checks fail for team creators / managers.

CREATE OR REPLACE FUNCTION public.team_billing_owner_matches(_team_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = _team_id
      AND t.owner_id IS NOT DISTINCT FROM _uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_team_role_any(_uid uuid, _team_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.team_id = _team_id
      AND ur.role = ANY (_roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.team_billing_owner_matches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_team_role_any(uuid, uuid, public.app_role[]) TO authenticated;

DROP POLICY IF EXISTS "Team billing owner inserts roles" ON public.user_roles;

CREATE POLICY "Team billing owner inserts roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.team_billing_owner_matches(team_id, auth.uid()));

DROP POLICY IF EXISTS "Team managers insert member roles" ON public.user_roles;

CREATE POLICY "Team managers insert member roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_team_role_any(
    auth.uid(),
    team_id,
    ARRAY[
      'owner'::public.app_role,
      'admin'::public.app_role,
      'campaign_manager'::public.app_role
    ]
  )
);
