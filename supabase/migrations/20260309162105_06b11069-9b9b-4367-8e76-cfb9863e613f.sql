
DROP POLICY IF EXISTS "Owners and admins can manage team roles" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.is_team_owner_or_admin(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = _team_id AND t.owner_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.team_id = _team_id AND ur.role = 'admin'::public.app_role
  )
$$;

CREATE POLICY "Owners and admins can manage team roles" ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_team_owner_or_admin(auth.uid(), team_id))
WITH CHECK (public.is_team_owner_or_admin(auth.uid(), team_id));
