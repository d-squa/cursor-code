-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

-- Create an improved policy that doesn't rely on profile timing
CREATE POLICY "Users can accept invitation and add their role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM invitations
    WHERE invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);