-- Fix infinite recursion in RLS policies for public.user_roles
-- The existing policy references user_roles within its own USING clause.

-- 1) Security definer helper: can a user view/manage roles in a given team?
CREATE OR REPLACE FUNCTION public.can_view_roles_in_team(_viewer_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Workspace owner always allowed
    EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = _team_id
        AND t.owner_id = _viewer_id
    )
    OR
    -- Or owner/admin role within that team
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _viewer_id
        AND ur.team_id = _team_id
        AND ur.role = ANY (ARRAY['owner'::public.app_role, 'admin'::public.app_role])
    );
$$;

-- 2) Replace the recursive policy with a function-based one
DROP POLICY IF EXISTS "Team owners can view team roles" ON public.user_roles;
CREATE POLICY "Team owners can view team roles"
ON public.user_roles
FOR SELECT
USING (public.can_view_roles_in_team(auth.uid(), user_roles.team_id));
