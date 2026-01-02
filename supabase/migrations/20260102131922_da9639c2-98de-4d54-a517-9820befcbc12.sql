-- Drop existing policies on creative_assignments
DROP POLICY IF EXISTS "Users can insert assignments" ON public.creative_assignments;
DROP POLICY IF EXISTS "Users can update their assignments" ON public.creative_assignments;
DROP POLICY IF EXISTS "Users can view their assignments" ON public.creative_assignments;
DROP POLICY IF EXISTS "Users can delete their assignments" ON public.creative_assignments;

-- Create improved RLS policies for creative_assignments
-- Users can view assignments for creatives they own OR campaigns they own
CREATE POLICY "Users can view their assignments" 
ON public.creative_assignments 
FOR SELECT 
USING (
  creative_id IN (SELECT id FROM creatives WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE team_id IN (
    SELECT team_id FROM user_roles WHERE user_id = auth.uid()
  ))
);

-- Users can insert assignments for creatives they own OR campaigns they own
CREATE POLICY "Users can insert assignments" 
ON public.creative_assignments 
FOR INSERT 
WITH CHECK (
  creative_id IN (SELECT id FROM creatives WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE team_id IN (
    SELECT team_id FROM user_roles WHERE user_id = auth.uid()
  ))
);

-- Users can update assignments they can access
CREATE POLICY "Users can update their assignments" 
ON public.creative_assignments 
FOR UPDATE 
USING (
  creative_id IN (SELECT id FROM creatives WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE team_id IN (
    SELECT team_id FROM user_roles WHERE user_id = auth.uid()
  ))
)
WITH CHECK (
  creative_id IN (SELECT id FROM creatives WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE team_id IN (
    SELECT team_id FROM user_roles WHERE user_id = auth.uid()
  ))
);

-- Users can delete assignments for their creatives or campaigns
CREATE POLICY "Users can delete their assignments" 
ON public.creative_assignments 
FOR DELETE 
USING (
  creative_id IN (SELECT id FROM creatives WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE team_id IN (
    SELECT team_id FROM user_roles WHERE user_id = auth.uid()
  ))
);