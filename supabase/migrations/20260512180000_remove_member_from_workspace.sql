-- Remove a user from every team in a billing workspace (all user_roles rows for teams in that workspace).

CREATE OR REPLACE FUNCTION public.remove_member_from_workspace(
  p_workspace_id uuid,
  p_target_user_id uuid
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
  IF p_workspace_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_workspace_id AND w.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'cannot remove the billing workspace owner this way' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.workspace_id = p_workspace_id
      AND t.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'transfer team ownership before removing this member from the workspace' USING ERRCODE = 'P0001';
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

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
    AND ur.team_id IN (
      SELECT t.id FROM public.teams t WHERE t.workspace_id = p_workspace_id
    );

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.invitations i
  SET status = 'cancelled'
  WHERE i.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_target_user_id
        AND lower(trim(p.email)) = lower(trim(i.email))
    )
    AND (
      i.workspace_id = p_workspace_id
      OR i.team_id IN (SELECT t.id FROM public.teams t WHERE t.workspace_id = p_workspace_id)
    );

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_member_from_workspace(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_member_from_workspace(uuid, uuid) IS
  'Deletes all user_roles for the target user for teams in the workspace; cancels matching pending invites.';
