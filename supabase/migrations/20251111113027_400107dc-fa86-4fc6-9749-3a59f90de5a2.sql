-- Allow users to insert their own role when they have a valid pending invitation
CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 
    FROM public.invitations 
    WHERE invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);