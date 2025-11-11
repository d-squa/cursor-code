-- Drop the problematic policy
DROP POLICY "Users can accept invitation and add their role" ON public.user_roles;

-- Create a corrected policy that doesn't access auth.users directly
CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 
    FROM public.invitations 
    JOIN public.profiles ON profiles.email = invitations.email
    WHERE profiles.id = auth.uid()
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);