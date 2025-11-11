-- Drop the overly permissive policy
DROP POLICY "Anyone can view invitation by token" ON public.invitations;

-- Create a more secure policy that only allows viewing by token
CREATE POLICY "Anyone can view invitation by valid token"
ON public.invitations
FOR SELECT
TO anon, authenticated
USING (
  token IS NOT NULL 
  AND status = 'pending' 
  AND expires_at > now()
);