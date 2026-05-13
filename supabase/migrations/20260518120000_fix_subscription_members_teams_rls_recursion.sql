-- PostgREST 500 on teams / workspace_subscription_members: RLS cycle.
-- teams SELECT referenced workspace_subscription_members; sm SELECT joined teams -> re-entered teams RLS.

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
  'RLS helper (definer, row_security off): caller may read all subscription roster rows for this workspace.';

GRANT EXECUTE ON FUNCTION public.workspace_subscription_roster_reader_can_see_all(uuid) TO authenticated;

DROP POLICY IF EXISTS workspace_subscription_members_select ON public.workspace_subscription_members;

CREATE POLICY workspace_subscription_members_select
  ON public.workspace_subscription_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.workspace_subscription_roster_reader_can_see_all(workspace_id)
  );
