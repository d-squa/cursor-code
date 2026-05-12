-- Client UPDATE on user_roles often returns success with 0 rows affected when RLS blocks the change.
-- Use the same pattern as remove_team_member_from_team: explicit SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.update_team_member_role(
  p_team_id uuid,
  p_target_user_id uuid,
  p_new_role public.app_role
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF p_team_id IS NULL OR p_target_user_id IS NULL OR p_new_role IS NULL THEN
    RETURN 0;
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own role here' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id AND t.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'workspace billing owner role cannot be changed here; transfer ownership first' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_team_id AND t.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.team_id = p_team_id
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
  WHERE ur.user_id = p_target_user_id
    AND ur.team_id = p_team_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member_role(uuid, uuid, public.app_role) TO authenticated;

COMMENT ON FUNCTION public.update_team_member_role(uuid, uuid, public.app_role) IS
  'Updates user_roles.role for one team when caller owns or manages that team; returns rows updated.';
