-- Apply user_roles insert policy using JWT email claim
DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE i.email = (auth.jwt() ->> 'email')
      AND i.team_id = user_roles.team_id
      AND i.role = user_roles.role
      AND i.status = 'pending'
      AND i.expires_at > now()
  )
);
