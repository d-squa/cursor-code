-- Drop existing policies on campaign_launch_status
DROP POLICY IF EXISTS "Users can view their own campaign launch statuses" ON public.campaign_launch_status;
DROP POLICY IF EXISTS "Users can insert their own campaign launch statuses" ON public.campaign_launch_status;
DROP POLICY IF EXISTS "Users can update their own campaign launch statuses" ON public.campaign_launch_status;

-- Create new policies that support team access
-- SELECT: Allow users to view launch statuses for campaigns they own OR campaigns in their team
CREATE POLICY "Users can view campaign launch statuses"
ON public.campaign_launch_status
FOR SELECT
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
      )
    )
  )
);

-- INSERT: Allow users to insert launch statuses for campaigns they own OR campaigns in their team (with edit role)
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
        AND ur.role IN ('admin', 'owner', 'campaign_manager', 'member')
      )
    )
  )
);

-- UPDATE: Allow users to update launch statuses for campaigns they own OR campaigns in their team (with edit role)
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
        AND ur.role IN ('admin', 'owner', 'campaign_manager', 'member')
      )
    )
  )
);

-- DELETE: Allow users to delete launch statuses for campaigns they own OR campaigns in their team (with edit role)
CREATE POLICY "Users can delete campaign launch statuses"
ON public.campaign_launch_status
FOR DELETE
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
        AND ur.role IN ('admin', 'owner', 'campaign_manager')
      )
    )
  )
);