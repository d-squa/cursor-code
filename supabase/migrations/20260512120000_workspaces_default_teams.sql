-- Workspaces = billing / subscription boundary. Each workspace has exactly one default team.
-- Teams under a workspace are capped by app tier (enforced in app + optional RPC later).

-- 1) Workspaces (one per billing owner, matching current "one subscriber owns N teams" model)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_team_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_billing_owner
  ON public.workspaces (owner_id);

COMMENT ON TABLE public.workspaces IS
  'Subscription/billing container. Each row has a default team; additional teams are optional.';

-- 2) Link teams to workspace (nullable until backfill completes)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_teams_workspace_id ON public.teams (workspace_id);

-- FK from workspace → default team (after teams have ids)
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_default_team_fk
  FOREIGN KEY (default_team_id) REFERENCES public.teams(id) ON DELETE SET NULL
  NOT VALID;

-- 3) Backfill: one workspace per distinct team owner; attach all their owned teams
INSERT INTO public.workspaces (owner_id, name)
SELECT DISTINCT t.owner_id,
  COALESCE(
    (SELECT t2.name FROM public.teams t2 WHERE t2.owner_id = t.owner_id ORDER BY t2.created_at ASC LIMIT 1),
    'Workspace'
  ) || ' — workspace'
FROM public.teams t
WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = t.owner_id);

UPDATE public.teams t
SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = t.owner_id
  AND t.workspace_id IS NULL;

-- 4) Mark one default team per workspace (oldest team in that workspace)
UPDATE public.teams t
SET is_default = false
WHERE t.workspace_id IS NOT NULL;

WITH first_per_ws AS (
  SELECT DISTINCT ON (workspace_id) id, workspace_id
  FROM public.teams
  WHERE workspace_id IS NOT NULL
  ORDER BY workspace_id, created_at ASC, id ASC
)
UPDATE public.teams t
SET is_default = true
FROM first_per_ws f
WHERE t.id = f.id;

-- 5) Set workspaces.default_team_id
UPDATE public.workspaces w
SET default_team_id = t.id
FROM public.teams t
WHERE t.workspace_id = w.id
  AND t.is_default = true;

ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_default_team_fk;

-- 6) Invitations: workspace-scoped (team_id remains for legacy; new flow uses default team)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.invitations i
SET workspace_id = t.workspace_id
FROM public.teams t
WHERE i.team_id = t.id
  AND i.workspace_id IS NULL
  AND t.workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_workspace_id ON public.invitations (workspace_id);

-- At most one default team per workspace
CREATE UNIQUE INDEX IF NOT EXISTS teams_one_default_per_workspace
  ON public.teams (workspace_id)
  WHERE is_default = true AND workspace_id IS NOT NULL;

-- Allow invitation INSERT when caller manages any team in the same workspace (not only billing owner)
DROP POLICY IF EXISTS "Team owners and admins can create invitations" ON public.invitations;
CREATE POLICY "Team owners and admins can create invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (
      SELECT 1
      FROM public.teams t
      INNER JOIN public.user_roles ur ON ur.team_id = t.id AND ur.user_id = auth.uid()
      WHERE invitations.workspace_id IS NOT NULL
        AND t.workspace_id = invitations.workspace_id
        AND ur.role = ANY (
          ARRAY[
            'owner'::public.app_role,
            'admin'::public.app_role,
            'campaign_manager'::public.app_role
          ]
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = invitations.team_id
        AND teams.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- 7) RLS: workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON public.workspaces;
CREATE POLICY "Users can view workspaces they belong to"
ON public.workspaces
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.teams t
    INNER JOIN public.user_roles ur ON ur.team_id = t.id AND ur.user_id = auth.uid()
    WHERE t.workspace_id = workspaces.id
  )
);

DROP POLICY IF EXISTS "Workspace owners can update their workspace" ON public.workspaces;
CREATE POLICY "Workspace owners can update their workspace"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Service / definer functions can still insert; app uses ensure_user_workspace for creation.
DROP POLICY IF EXISTS "Workspace owners can insert their workspace" ON public.workspaces;
CREATE POLICY "Workspace owners can insert their workspace"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.workspaces TO authenticated;

-- 8) Replace ensure_user_workspace: always workspace + default team
CREATE OR REPLACE FUNCTION public.ensure_user_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security = off
AS $$
DECLARE
  uid uuid;
  email text;
  wid uuid;
  tid uuid;
  base_name text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  email := auth.jwt() ->> 'email';

  INSERT INTO public.profiles (id, email)
  VALUES (uid, COALESCE(email, ''))
  ON CONFLICT (id)
  DO UPDATE SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  SELECT id INTO wid FROM public.workspaces WHERE owner_id = uid LIMIT 1;

  IF wid IS NULL THEN
    base_name := NULLIF(split_part(COALESCE(email, ''), '@', 1), '');
    INSERT INTO public.workspaces (owner_id, name)
    VALUES (
      uid,
      COALESCE(base_name, 'My') || '''s workspace'
    )
    RETURNING id INTO wid;
  END IF;

  SELECT id INTO tid
  FROM public.teams
  WHERE workspace_id = wid AND is_default = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF tid IS NULL THEN
    base_name := NULLIF(split_part(COALESCE(email, ''), '@', 1), '');
    INSERT INTO public.teams (name, owner_id, description, workspace_id, is_default)
    VALUES (
      COALESCE(base_name, 'My') || '''s Team',
      uid,
      'Default team',
      wid,
      true
    )
    RETURNING id INTO tid;

    UPDATE public.workspaces
    SET default_team_id = tid, updated_at = now()
    WHERE id = wid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.team_id = tid AND ur.role = 'owner'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role, team_id)
    VALUES (uid, 'owner'::public.app_role, tid);
  END IF;

  RETURN tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_workspace() TO authenticated;

-- Require every team to belong to a workspace after backfill
ALTER TABLE public.teams ALTER COLUMN workspace_id SET NOT NULL;
