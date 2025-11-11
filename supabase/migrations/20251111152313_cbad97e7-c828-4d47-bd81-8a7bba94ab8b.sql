-- Retry: ensure clean creation of the invitee update policy
DROP POLICY IF EXISTS "Invitee can accept their own invitation" ON public.invitations;

CREATE POLICY "Invitee can accept their own invitation"
ON public.invitations
FOR UPDATE
USING (
  email = (auth.jwt() ->> 'email')
  AND status = 'pending'
  AND expires_at > now()
)
WITH CHECK (
  email = (auth.jwt() ->> 'email')
  AND status = 'accepted'
);
