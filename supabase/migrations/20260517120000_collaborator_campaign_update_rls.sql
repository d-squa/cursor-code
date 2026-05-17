-- Collaborators may persist extension-mode / QC-related campaign updates (UI restricts scope).
DROP POLICY IF EXISTS "Team members with edit role can update campaigns" ON public.campaigns;

CREATE POLICY "Team members with edit role can update campaigns"
ON public.campaigns
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = campaigns.team_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role IN (
        'admin'::public.app_role,
        'owner'::public.app_role,
        'campaign_manager'::public.app_role,
        'member'::public.app_role,
        'collaborator'::public.app_role
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = campaigns.team_id
      AND t.owner_id = auth.uid()
  )
);

-- Launch status writes for collaborators extending live campaigns
DROP POLICY IF EXISTS "Users can insert campaign launch statuses" ON public.campaign_launch_status;
DROP POLICY IF EXISTS "Users can update campaign launch statuses" ON public.campaign_launch_status;

CREATE POLICY "Users can insert campaign launch statuses"
ON public.campaign_launch_status
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.team_id = c.team_id
            AND ur.user_id = auth.uid()
            AND ur.role IN (
              'admin'::public.app_role,
              'owner'::public.app_role,
              'campaign_manager'::public.app_role,
              'member'::public.app_role,
              'collaborator'::public.app_role
            )
        )
        OR EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = c.team_id AND t.owner_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Users can update campaign launch statuses"
ON public.campaign_launch_status
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.team_id = c.team_id
            AND ur.user_id = auth.uid()
            AND ur.role IN (
              'admin'::public.app_role,
              'owner'::public.app_role,
              'campaign_manager'::public.app_role,
              'member'::public.app_role,
              'collaborator'::public.app_role
            )
        )
        OR EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = c.team_id AND t.owner_id = auth.uid()
        )
      )
  )
);
