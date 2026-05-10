-- Fix RLS 42501 on user_roles INSERT: managers must include team owner/admin/campaign_manager
-- rows on user_roles, not only teams.owner_id + admin (workspace owners listed only as role=owner failed).

CREATE OR REPLACE FUNCTION public.is_team_owner_or_admin(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = _team_id AND t.owner_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.team_id = _team_id
      AND ur.role = ANY (
        ARRAY[
          'owner'::public.app_role,
          'admin'::public.app_role,
          'campaign_manager'::public.app_role
        ]
      )
  )
$$;

COMMENT ON FUNCTION public.is_team_owner_or_admin(uuid, uuid) IS
  'RLS helper: team billing owner (teams.owner_id) or elevated role on user_roles for that team.';

-- Ensure invitation acceptance INSERT remains (prod drift may have dropped it).
DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE lower(trim(COALESCE(i.email, ''))) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
      AND i.team_id = user_roles.team_id
      AND i.role = user_roles.role
      AND i.status = 'pending'
      AND i.expires_at > now()
  )
);
