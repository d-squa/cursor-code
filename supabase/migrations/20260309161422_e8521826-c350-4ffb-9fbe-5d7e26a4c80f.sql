-- Fix RLS: Allow workspace owners (not just admins) to manage user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Owners and admins can manage team roles" ON public.user_roles
FOR ALL
TO authenticated
USING (
  -- Owner of the team
  EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = user_roles.team_id AND t.owner_id = auth.uid()
  )
  OR
  -- Admin role within that team
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.team_id = user_roles.team_id
      AND ur.role = 'admin'::public.app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = user_roles.team_id AND t.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.team_id = user_roles.team_id
      AND ur.role = 'admin'::public.app_role
  )
);