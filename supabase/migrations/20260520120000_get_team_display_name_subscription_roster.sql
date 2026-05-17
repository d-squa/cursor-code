-- Allow subscription roster users (no user_roles / not owner) to resolve default team name;
-- add fallback when they have no owned team and no user_roles row yet.
CREATE OR REPLACE FUNCTION public.get_team_display_name_for_ui(p_team_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT t.name
      FROM public.teams t
      WHERE p_team_id IS NOT NULL
        AND t.id = p_team_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.team_id = t.id
              AND ur.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.workspaces w
            INNER JOIN public.workspace_subscription_members sm
              ON sm.workspace_id = w.id
             AND sm.user_id = auth.uid()
            WHERE w.default_team_id = t.id
          )
        )
      LIMIT 1
    ),
    (
      SELECT t.name
      FROM public.teams t
      WHERE t.owner_id = auth.uid()
      ORDER BY t.created_at ASC
      LIMIT 1
    ),
    (
      SELECT t.name
      FROM public.workspaces w
      INNER JOIN public.teams t ON t.id = w.default_team_id
      INNER JOIN public.workspace_subscription_members sm
        ON sm.workspace_id = w.id
       AND sm.user_id = auth.uid()
      ORDER BY w.created_at ASC NULLS LAST
      LIMIT 1
    ),
    (
      SELECT t.name
      FROM public.teams t
      INNER JOIN public.user_roles ur
        ON ur.team_id = t.id
       AND ur.user_id = auth.uid()
      ORDER BY t.created_at ASC
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_team_display_name_for_ui(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_display_name_for_ui(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_display_name_for_ui(uuid) TO service_role;
