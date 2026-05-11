-- Set the same app_role on every membership row the target has in teams under this billing workspace.

CREATE OR REPLACE FUNCTION public.update_member_role_in_workspace(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_new_role public.app_role
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  n int := 0;
BEGIN
  IF p_workspace_id IS NULL OR p_target_user_id IS NULL OR p_new_role IS NULL THEN
    RETURN 0;
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own role here' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_workspace_id AND w.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'cannot change the billing workspace owner role here' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.workspace_id = p_workspace_id AND t.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'transfer team ownership before changing this member role' USING ERRCODE = 'P0001';
  END IF;

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
        AND ur.role = ANY (
          ARRAY[
            'owner'::public.app_role,
            'admin'::public.app_role,
            'campaign_manager'::public.app_role
          ]
        )
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_roles ur
  SET role = p_new_role
  FROM public.teams t
  WHERE ur.user_id = p_target_user_id
    AND ur.team_id = t.id
    AND t.workspace_id = p_workspace_id
    AND t.owner_id IS DISTINCT FROM p_target_user_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_role_in_workspace(uuid, uuid, public.app_role) TO authenticated;

COMMENT ON FUNCTION public.update_member_role_in_workspace(uuid, uuid, public.app_role) IS
  'Sets user_roles.role for all teams in a billing workspace for the target (not billing owner / team owner rows).';
