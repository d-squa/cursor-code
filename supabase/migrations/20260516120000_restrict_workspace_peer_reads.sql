-- Revert workspace-wide "peer" reads: members may only see roles/profiles for teams they belong to,
-- plus the same elevated workspace managers as teams SELECT (billing owner, subscription owner/admin,
-- any team owner in workspace, team admin in workspace).
-- Also restrict get_workspace_member_summaries to those managers (not every subscription member).

CREATE OR REPLACE FUNCTION public.can_view_roles_in_team(_viewer_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security = off
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
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t_row
      INNER JOIN public.workspaces w ON w.id = t_row.workspace_id
      WHERE t_row.id = _team_id
        AND t_row.workspace_id IS NOT NULL
        AND w.owner_id = _viewer_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t_row
      INNER JOIN public.workspace_subscription_members sm ON sm.workspace_id = t_row.workspace_id
      WHERE t_row.id = _team_id
        AND t_row.workspace_id IS NOT NULL
        AND sm.user_id = _viewer_id
        AND sm.role = ANY (
          ARRAY[
            'owner'::public.app_role,
            'admin'::public.app_role
          ]
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t_row
      INNER JOIN public.teams t_own ON t_own.workspace_id = t_row.workspace_id
      WHERE t_row.id = _team_id
        AND t_row.workspace_id IS NOT NULL
        AND t_own.owner_id = _viewer_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams ta ON ta.id = ur.team_id
      INNER JOIN public.teams t_row ON t_row.workspace_id = ta.workspace_id
      WHERE t_row.id = _team_id
        AND ur.user_id = _viewer_id
        AND ur.role = 'admin'::public.app_role
    );
$$;

COMMENT ON FUNCTION public.can_view_roles_in_team(uuid, uuid) IS
  'Team owner, any teammate on that team, or workspace managers (billing owner, subscription owner/admin, any team owner in workspace, team admin on any team in workspace) may view user_roles for the team.';

DROP POLICY IF EXISTS "Workspace peers can view member profiles" ON public.profiles;

DROP FUNCTION IF EXISTS public.get_workspace_member_summaries(uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_member_summaries(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role public.app_role,
  company_name text,
  created_at timestamptz,
  team_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_billing_owner_id uuid;
BEGIN
  IF p_workspace_id IS NULL THEN
    RETURN;
  END IF;

  SELECT w.owner_id INTO v_billing_owner_id
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  IF NOT (
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
      SELECT 1
      FROM public.teams t_own
      WHERE t_own.workspace_id = p_workspace_id
        AND t_own.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t ON t.id = ur.team_id
      WHERE t.workspace_id = p_workspace_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email::text,
    CASE
      WHEN v_billing_owner_id IS NOT NULL AND p.id = v_billing_owner_id THEN 'owner'::public.app_role
      ELSE sm.role
    END AS eff_role,
    p.company_name::text,
    p.created_at,
    COALESCE(
      (
        SELECT array_agg(DISTINCT tnm.name ORDER BY tnm.name)
        FROM public.user_roles urx
        INNER JOIN public.teams tnm ON tnm.id = urx.team_id
        WHERE urx.user_id = sm.user_id
          AND tnm.workspace_id = p_workspace_id
      ),
      ARRAY[]::text[]
    ) AS team_names
  FROM public.workspace_subscription_members sm
  INNER JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.workspace_id = p_workspace_id
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_workspace_member_summaries(uuid) IS
  'Subscription roster (definer read): billing owner, subscription owner/admin, any team owner in workspace, or team admin may list.';
