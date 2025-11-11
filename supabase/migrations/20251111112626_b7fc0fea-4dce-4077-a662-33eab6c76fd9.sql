-- Allow anyone to view an invitation by its token (needed for accepting invitations before signup)
CREATE POLICY "Anyone can view invitation by token"
ON public.invitations
FOR SELECT
TO anon, authenticated
USING (true);