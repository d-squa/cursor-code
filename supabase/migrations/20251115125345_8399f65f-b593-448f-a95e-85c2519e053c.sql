-- Add delete policy for team members
CREATE POLICY "Team members can delete team campaigns"
ON campaigns
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.team_id = campaigns.team_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'owner', 'campaign_manager', 'member')
  )
);