-- Create activity_logs table for post-push action logging
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('budget_adjustment', 'targeting_change', 'creative_update', 'pause_resume', 'note')),
  title TEXT NOT NULL,
  description TEXT,
  affected_platforms TEXT[] DEFAULT '{}',
  affected_markets TEXT[] DEFAULT '{}',
  affected_phases TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can view activity logs for campaigns they have access to
CREATE POLICY "Users can view activity logs for their campaigns"
ON public.activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = activity_logs.campaign_id
    AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
    ))
  )
);

-- Users can create activity logs for campaigns they have access to
CREATE POLICY "Users can create activity logs for accessible campaigns"
ON public.activity_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = activity_logs.campaign_id
    AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
    ))
  )
);

-- Users can update their own activity logs
CREATE POLICY "Users can update their own activity logs"
ON public.activity_logs
FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own activity logs
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_logs
FOR DELETE
USING (user_id = auth.uid());

-- Create index for faster queries
CREATE INDEX idx_activity_logs_campaign_id ON public.activity_logs(campaign_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);