-- Fix infinite recursion in teams RLS introduced by workspace peer visibility policy.
-- The old policy joined public.teams inside a teams policy expression.

CREATE OR REPLACE FUNCTION public.workspace_has_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.teams t ON t.id = ur.team_id
    WHERE ur.user_id = _user_id
      AND t.workspace_id = _workspace_id
  );
$$;

COMMENT ON FUNCTION public.workspace_has_member(uuid, uuid) IS
  'RLS helper: true when the user has any membership in the given billing workspace.';

DROP POLICY IF EXISTS "Workspace members can view teams in same workspace" ON public.teams;

CREATE POLICY "Workspace members can view teams in same workspace"
ON public.teams
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND public.workspace_has_member(workspace_id, auth.uid())
);

