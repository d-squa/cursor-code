-- Reliable member removal: client DELETE was blocked or no-op under RLS for some rows (silent 0 deletes).
-- Also cancel pending invitations for the same person + team when removing membership.

CREATE OR REPLACE FUNCTION public.remove_team_member_from_team(
  p_target_user_id uuid,
  p_team_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF p_target_user_id IS NULL OR p_team_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself' USING ERRCODE = 'P0001';
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

  IF EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id AND t.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'transfer team ownership before removing this user' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
    AND ur.team_id = p_team_id;

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.invitations i
  SET status = 'cancelled'
  WHERE i.team_id = p_team_id
    AND i.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_target_user_id
        AND lower(trim(p.email)) = lower(trim(i.email))
    );

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_user_from_teams_i_manage(p_target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = ur.team_id AND t.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles mgr
        WHERE mgr.user_id = auth.uid()
          AND mgr.team_id = ur.team_id
          AND mgr.role = ANY (
            ARRAY[
              'owner'::public.app_role,
              'admin'::public.app_role,
              'campaign_manager'::public.app_role
            ]
          )
      )
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
      EXISTS (SELECT 1 FROM public.teams t WHERE t.id = i.team_id AND t.owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_roles mgr
        WHERE mgr.user_id = auth.uid()
          AND mgr.team_id = i.team_id
          AND mgr.role = ANY (
            ARRAY[
              'owner'::public.app_role,
              'admin'::public.app_role,
              'campaign_manager'::public.app_role
            ]
          )
      )
    );

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_team_member_from_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_from_teams_i_manage(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_team_member_from_team(uuid, uuid) IS
  'Deletes user_roles for one team if caller owns or manages that team; cancels matching pending invites.';

COMMENT ON FUNCTION public.remove_user_from_teams_i_manage(uuid) IS
  'Deletes target memberships only for teams the caller owns or manages; cancels pending invites the caller can administer.';
