-- Full subscription roster for managers without relying on RLS-visible user_roles joins.
-- Same authorization idea as update_member_role_in_workspace / remove_member_from_workspace.
-- Later migrations add team_names to RETURNS TABLE; DROP first so this file can apply on newer DBs.
DROP FUNCTION IF EXISTS public.get_workspace_member_summaries(uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_member_summaries(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role public.app_role,
  company_name text,
  created_at timestamptz
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

  -- Any billing workspace member may read the roster (matches workspace peer visibility).
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t ON t.id = ur.team_id
      WHERE t.workspace_id = p_workspace_id
        AND ur.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH team_ids AS (
    SELECT t.id AS team_id
    FROM public.teams t
    WHERE t.workspace_id = p_workspace_id
  ),
  role_rows AS (
    SELECT ur.user_id AS uid, ur.role AS r
    FROM public.user_roles ur
    WHERE ur.team_id IN (SELECT ti.team_id FROM team_ids ti)
  ),
  candidates AS (
    SELECT DISTINCT rr.uid
    FROM role_rows rr
    UNION
    SELECT v_billing_owner_id AS uid
    WHERE v_billing_owner_id IS NOT NULL
  ),
  effective AS (
    SELECT
      c.uid AS user_id,
      CASE
        WHEN v_billing_owner_id IS NOT NULL AND c.uid = v_billing_owner_id THEN 'owner'::public.app_role
        ELSE (
          SELECT rr.r
          FROM role_rows rr
          WHERE rr.uid = c.uid
          ORDER BY
            CASE rr.r
              WHEN 'owner'::public.app_role THEN 1
              WHEN 'admin'::public.app_role THEN 2
              WHEN 'campaign_manager'::public.app_role THEN 3
              WHEN 'collaborator'::public.app_role THEN 4
              WHEN 'member'::public.app_role THEN 5
              WHEN 'viewer'::public.app_role THEN 6
              ELSE 99
            END
          LIMIT 1
        )
      END AS eff_role
    FROM candidates c
  )
  SELECT
    p.id,
    p.email::text,
    e.eff_role AS role,
    p.company_name::text,
    p.created_at
  FROM effective e
  INNER JOIN public.profiles p ON p.id = e.user_id
  WHERE e.eff_role IS NOT NULL
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_member_summaries(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_workspace_member_summaries(uuid) IS
  'Returns profiles + effective app_role for everyone in a billing workspace (definer read; managers only).';
