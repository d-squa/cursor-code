-- Restrict workspace-wide team visibility: only managers (not every member) may list all teams
-- under the same billing workspace. Others keep access only to teams they own or have user_roles on.

DROP POLICY IF EXISTS "Workspace members can view teams in same workspace" ON public.teams;
DROP POLICY IF EXISTS "Workspace managers can view all teams in workspace" ON public.teams;

CREATE POLICY "Workspace managers can view all teams in workspace"
ON public.teams
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = teams.workspace_id
        AND w.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_subscription_members sm
      WHERE sm.workspace_id = teams.workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role = ANY (
          ARRAY[
            'owner'::public.app_role,
            'admin'::public.app_role
          ]
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.teams t_owned
      WHERE t_owned.workspace_id = teams.workspace_id
        AND t_owned.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t_admin ON t_admin.id = ur.team_id
      WHERE t_admin.workspace_id = teams.workspace_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    )
  )
);

COMMENT ON POLICY "Workspace managers can view all teams in workspace" ON public.teams IS
  'Billing owner, subscription owner/admin, any team owner in the workspace, or team admin on any team may SELECT all teams sharing workspace_id. Other roles rely on member/owner policies per team.';
