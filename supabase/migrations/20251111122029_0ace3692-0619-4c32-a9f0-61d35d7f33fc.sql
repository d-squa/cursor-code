-- Add team_id to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_campaigns_team_id ON public.campaigns(team_id);

-- Update RLS policies to allow team members to view and edit campaigns
CREATE POLICY "Team members can view team campaigns"
ON public.campaigns
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = campaigns.team_id
    AND user_roles.user_id = auth.uid()
  )
);

CREATE POLICY "Team members with edit role can update campaigns"
ON public.campaigns
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = campaigns.team_id
    AND user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'owner', 'campaign_manager', 'member')
  )
);