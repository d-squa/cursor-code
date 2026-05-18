-- Share connected_platforms across team / subscription workspace members (not only the connecting user).

CREATE OR REPLACE FUNCTION public.auth_user_can_access_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p_team_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = p_team_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.team_id = t.id
              AND ur.user_id = auth.uid()
          )
          OR (
            t.workspace_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.workspace_subscription_members sm
              WHERE sm.workspace_id = t.workspace_id
                AND sm.user_id = auth.uid()
            )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_can_manage_team_platforms(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p_team_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id = p_team_id
          AND t.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.team_id = p_team_id
          AND ur.user_id = auth.uid()
          AND ur.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
      OR EXISTS (
        SELECT 1
        FROM public.teams t
        INNER JOIN public.workspace_subscription_members sm
          ON sm.workspace_id = t.workspace_id
         AND sm.user_id = auth.uid()
        WHERE t.id = p_team_id
          AND sm.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_team(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.auth_user_can_manage_team_platforms(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_manage_team_platforms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_can_manage_team_platforms(uuid) TO service_role;

-- Backfill team_id from linked ad accounts
UPDATE public.connected_platforms cp
SET team_id = src.team_id,
    updated_at = now()
FROM (
  SELECT platform_id, team_id
  FROM public.meta_ad_accounts
  WHERE platform_id IS NOT NULL AND team_id IS NOT NULL
  UNION
  SELECT platform_id, team_id
  FROM public.tiktok_ad_accounts
  WHERE platform_id IS NOT NULL AND team_id IS NOT NULL
  UNION
  SELECT platform_id, team_id
  FROM public.google_ad_accounts
  WHERE platform_id IS NOT NULL AND team_id IS NOT NULL
) src
WHERE cp.id = src.platform_id
  AND cp.team_id IS NULL;

-- Fallback: connecting user's owned team
UPDATE public.connected_platforms cp
SET team_id = t.id,
    updated_at = now()
FROM public.teams t
WHERE cp.team_id IS NULL
  AND t.owner_id = cp.user_id
  AND t.id = (
    SELECT t2.id
    FROM public.teams t2
    WHERE t2.owner_id = cp.user_id
    ORDER BY t2.created_at ASC
    LIMIT 1
  );

-- Fallback: any team membership for the connector
UPDATE public.connected_platforms cp
SET team_id = ur.team_id,
    updated_at = now()
FROM public.user_roles ur
WHERE cp.team_id IS NULL
  AND ur.user_id = cp.user_id
  AND ur.team_id IS NOT NULL
  AND ur.team_id = (
    SELECT ur2.team_id
    FROM public.user_roles ur2
    WHERE ur2.user_id = cp.user_id
      AND ur2.team_id IS NOT NULL
    ORDER BY ur2.created_at ASC
    LIMIT 1
  );

DROP POLICY IF EXISTS "Users can view their own connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can create their own connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can update their own connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can delete their own connected platforms" ON public.connected_platforms;
-- Idempotent: allow re-run after partial apply or manual SQL editor run
DROP POLICY IF EXISTS "Users can view team connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can create team connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can update team connected platforms" ON public.connected_platforms;
DROP POLICY IF EXISTS "Users can delete team connected platforms" ON public.connected_platforms;

CREATE POLICY "Users can view team connected platforms"
ON public.connected_platforms
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (team_id IS NOT NULL AND public.auth_user_can_access_team(team_id))
);

CREATE POLICY "Users can create team connected platforms"
ON public.connected_platforms
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    team_id IS NULL
    OR public.auth_user_can_access_team(team_id)
  )
);

CREATE POLICY "Users can update team connected platforms"
ON public.connected_platforms
FOR UPDATE
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(team_id))
  OR (team_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY "Users can delete team connected platforms"
ON public.connected_platforms
FOR DELETE
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(team_id))
);

-- platform_accounts: inherit access from parent connection
DROP POLICY IF EXISTS "Users can view their platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can create their platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can delete their platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can update their platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can view team platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can create team platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can update team platform accounts" ON public.platform_accounts;
DROP POLICY IF EXISTS "Users can delete team platform accounts" ON public.platform_accounts;

CREATE POLICY "Users can view team platform accounts"
ON public.platform_accounts
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.id = platform_accounts.connected_platform_id
      AND (
        cp.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (cp.team_id IS NOT NULL AND public.auth_user_can_access_team(cp.team_id))
      )
  )
);

CREATE POLICY "Users can create team platform accounts"
ON public.platform_accounts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.id = platform_accounts.connected_platform_id
      AND (
        cp.user_id = auth.uid()
        OR (cp.team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(cp.team_id))
      )
  )
);

CREATE POLICY "Users can update team platform accounts"
ON public.platform_accounts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.id = platform_accounts.connected_platform_id
      AND (
        cp.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (cp.team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(cp.team_id))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.id = platform_accounts.connected_platform_id
      AND (
        cp.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (cp.team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(cp.team_id))
      )
  )
);

CREATE POLICY "Users can delete team platform accounts"
ON public.platform_accounts
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.id = platform_accounts.connected_platform_id
      AND (
        cp.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (cp.team_id IS NOT NULL AND public.auth_user_can_manage_team_platforms(cp.team_id))
      )
  )
);

-- Ad account tables: subscription roster + team members (not only user_roles)
DROP POLICY IF EXISTS "Users can view ad accounts in their team" ON public.meta_ad_accounts;
CREATE POLICY "Users can view ad accounts in their team"
ON public.meta_ad_accounts
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (team_id IS NOT NULL AND public.auth_user_can_access_team(team_id))
);

DROP POLICY IF EXISTS "Users can view TikTok ad accounts in their team" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can view TikTok ad accounts in their team"
ON public.tiktok_ad_accounts
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (team_id IS NOT NULL AND public.auth_user_can_access_team(team_id))
);

DROP POLICY IF EXISTS "Team members can view google ad accounts" ON public.google_ad_accounts;
CREATE POLICY "Team members can view google ad accounts"
ON public.google_ad_accounts
FOR SELECT
TO authenticated
USING (
  team_id IS NOT NULL
  AND public.auth_user_can_access_team(team_id)
);
