-- Subscription-level membership (Settings → Subscription users), separate from team-scoped user_roles.

CREATE OR REPLACE FUNCTION public.app_role_priority(r public.app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'owner'::public.app_role THEN 1
    WHEN 'admin'::public.app_role THEN 2
    WHEN 'campaign_manager'::public.app_role THEN 3
    WHEN 'collaborator'::public.app_role THEN 4
    WHEN 'member'::public.app_role THEN 5
    WHEN 'viewer'::public.app_role THEN 6
    ELSE 99
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_role_stronger(a public.app_role, b public.app_role)
RETURNS public.app_role
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.app_role_priority(a) <= public.app_role_priority(b) THEN a
    ELSE b
  END;
$$;

CREATE TABLE IF NOT EXISTS public.workspace_subscription_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member'::public.app_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_subscription_members_user_id
  ON public.workspace_subscription_members(user_id);

ALTER TABLE public.workspace_subscription_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_subscription_members_select ON public.workspace_subscription_members;

CREATE POLICY workspace_subscription_members_select
  ON public.workspace_subscription_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_subscription_members.workspace_id
        AND w.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t ON t.id = ur.team_id
      WHERE t.workspace_id = workspace_subscription_members.workspace_id
        AND ur.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_subscription_members sm2
      WHERE sm2.workspace_id = workspace_subscription_members.workspace_id
        AND sm2.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.workspace_subscription_members FROM PUBLIC;
GRANT SELECT ON public.workspace_subscription_members TO authenticated;
GRANT ALL ON public.workspace_subscription_members TO service_role;

-- Invitations from Subscription users use subscription_access_only = true (no team user_roles on accept).
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS subscription_access_only boolean NOT NULL DEFAULT false;

-- Backfill subscription roster from team memberships + billing owners.
INSERT INTO public.workspace_subscription_members (workspace_id, user_id, role)
SELECT x.workspace_id,
       x.user_id,
       (array_agg(x.role ORDER BY public.app_role_priority(x.role)))[1] AS best_role
FROM (
  SELECT t.workspace_id,
         ur.user_id,
         ur.role
  FROM public.user_roles ur
  INNER JOIN public.teams t ON t.id = ur.team_id
  WHERE t.workspace_id IS NOT NULL
) x
GROUP BY x.workspace_id, x.user_id
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = public.app_role_stronger(
  public.workspace_subscription_members.role,
  EXCLUDED.role
);

INSERT INTO public.workspace_subscription_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'::public.app_role
FROM public.workspaces w
WHERE w.owner_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = 'owner'::public.app_role;

-- Subscription roster + team labels (user_roles are team-only; role here is subscription role).
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
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.teams t ON t.id = ur.team_id
      WHERE t.workspace_id = p_workspace_id
        AND ur.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_subscription_members sm
      WHERE sm.workspace_id = p_workspace_id
        AND sm.user_id = auth.uid()
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

GRANT EXECUTE ON FUNCTION public.get_workspace_member_summaries(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_workspace_member_summaries(uuid) IS
  'Subscription roster: profiles + subscription role + team name labels (definer read).';

CREATE OR REPLACE FUNCTION public.update_subscription_member_role(
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
    RAISE EXCEPTION 'cannot change your own subscription role here' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_workspace_id AND w.owner_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'cannot change the billing workspace owner subscription role' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_role = 'owner'::public.app_role THEN
    RAISE EXCEPTION 'cannot assign owner subscription role' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_subscription_members sm
      WHERE sm.workspace_id = p_workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_subscription_members sm
  SET role = p_new_role,
      updated_at = now()
  WHERE sm.workspace_id = p_workspace_id
    AND sm.user_id = p_target_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.owner_id = p_target_user_id
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_subscription_member_role(uuid, uuid, public.app_role) TO authenticated;

COMMENT ON FUNCTION public.update_subscription_member_role(uuid, uuid, public.app_role) IS
  'Updates workspace_subscription_members only (billing owner or subscription admin).';

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
  m int := 0;
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
      SELECT 1 FROM public.workspace_subscription_members sm0
      WHERE sm0.workspace_id = p_workspace_id
        AND sm0.user_id = auth.uid()
        AND sm0.role = 'admin'::public.app_role
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

  DELETE FROM public.workspace_subscription_members sm
  WHERE sm.workspace_id = p_workspace_id
    AND sm.user_id = p_target_user_id;

  GET DIAGNOSTICS m = ROW_COUNT;

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

  RETURN n + m;
END;
$$;

COMMENT ON FUNCTION public.remove_member_from_workspace(uuid, uuid) IS
  'Deletes team user_roles and subscription membership for the target in the workspace; cancels matching pending invites.';

DROP FUNCTION IF EXISTS public.app_role_stronger(public.app_role, public.app_role);
DROP FUNCTION IF EXISTS public.app_role_priority(public.app_role);
