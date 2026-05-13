-- teams policy "Workspace managers..." used EXISTS subqueries against public.teams.
-- Evaluating those rows re-applied teams RLS on the inner scan -> infinite recursion -> PostgREST 500.
-- Delegate the manager check to workspace_subscription_roster_reader_can_see_all (SECURITY DEFINER, row_security off).

CREATE OR REPLACE FUNCTION public.workspace_subscription_roster_reader_can_see_all(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security = off
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_subscription_members sm
      WHERE sm.workspace_id = p_workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role = ANY (
          ARRAY[
            'owner'::public.app_role,
            'admin'::public.app_role
          ]
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.workspace_id = p_workspace_id AND t.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t ON t.id = ur.team_id
      WHERE t.workspace_id = p_workspace_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    );
$$;

COMMENT ON FUNCTION public.workspace_subscription_roster_reader_can_see_all(uuid) IS
  'RLS helper (definer, row_security off): billing owner, subscription owner/admin, team owner in workspace, or team admin.';

GRANT EXECUTE ON FUNCTION public.workspace_subscription_roster_reader_can_see_all(uuid) TO authenticated;

DROP POLICY IF EXISTS "Workspace managers can view all teams in workspace" ON public.teams;

CREATE POLICY "Workspace managers can view all teams in workspace"
ON public.teams
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND public.workspace_subscription_roster_reader_can_see_all(workspace_id)
);

COMMENT ON POLICY "Workspace managers can view all teams in workspace" ON public.teams IS
  'Workspace managers see all teams in billing workspace via SECURITY DEFINER helper (avoids teams-in-teams RLS recursion).';
