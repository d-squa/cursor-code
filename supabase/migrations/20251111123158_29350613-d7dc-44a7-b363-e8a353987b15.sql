CREATE POLICY "Team members can view member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur_self
    JOIN public.user_roles ur_other
      ON ur_self.team_id = ur_other.team_id
    WHERE ur_self.user_id = auth.uid()
      AND ur_other.user_id = profiles.id
  )
);
