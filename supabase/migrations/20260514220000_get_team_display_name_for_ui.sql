-- Stable team label for UI (taxonomy / media plan) when a user owns or belongs to multiple teams.
-- Avoids PostgREST PGRST116 from .maybeSingle() on teams filtered only by owner_id.
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
