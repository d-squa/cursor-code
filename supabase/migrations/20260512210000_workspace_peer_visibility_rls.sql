-- Workspace-wide roster: any member of a billing workspace can see sibling teams, roles, and profiles
-- in that workspace (read). Fixes incomplete client queries when admins only belong to the default team.

-- 1) Teams: see all teams sharing your workspace_id (not only teams you have a row on)
CREATE POLICY "Workspace members can view teams in same workspace"
ON public.teams
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.teams t2 ON t2.id = ur.team_id
    WHERE ur.user_id = auth.uid()
      AND t2.workspace_id = teams.workspace_id
  )
);

-- 2) user_roles: extend can_view_roles_in_team to any peer in the same billing workspace
CREATE OR REPLACE FUNCTION public.can_view_roles_in_team(_viewer_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = _team_id
        AND t.owner_id = _viewer_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _viewer_id
        AND ur.team_id = _team_id
        AND ur.role = ANY (
          ARRAY['owner'::public.app_role, 'admin'::public.app_role]
        )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.teams t_row
        WHERE t_row.id = _team_id
          AND t_row.workspace_id IS NOT NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur_me
        INNER JOIN public.teams t_me ON t_me.id = ur_me.team_id
        INNER JOIN public.teams t_row ON t_row.id = _team_id
          AND t_row.workspace_id = t_me.workspace_id
        WHERE ur_me.user_id = _viewer_id
      )
    );
$$;

COMMENT ON FUNCTION public.can_view_roles_in_team(uuid, uuid) IS
  'RLS helper: team owner, owner/admin on that team, or any member of the same billing workspace.';

-- 3) Profiles: anyone in the same workspace can read profiles of users who have a role in that workspace
CREATE POLICY "Workspace peers can view member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur_t
    INNER JOIN public.teams t_t ON t_t.id = ur_t.team_id
    WHERE ur_t.user_id = profiles.id
      AND t_t.workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur_me
        INNER JOIN public.teams t_me ON t_me.id = ur_me.team_id
        WHERE ur_me.user_id = auth.uid()
          AND t_me.workspace_id = t_t.workspace_id
      )
  )
);
