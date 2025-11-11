-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

-- Create a working policy that uses profiles table instead of auth.users
CREATE POLICY "Users can accept invitation and add their role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM invitations
    JOIN profiles ON profiles.email = invitations.email
    WHERE profiles.id = auth.uid()
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);