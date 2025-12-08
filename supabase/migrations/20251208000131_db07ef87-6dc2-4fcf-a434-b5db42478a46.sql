-- Create campaign_launch_status table to track push operations per entity
CREATE TABLE public.campaign_launch_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  market TEXT NOT NULL,
  phase_name TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad_group')),
  entity_name TEXT,
  dsp_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending_validation', 'validation_error', 'ready_for_push', 'pushing', 'pushed_to_dsp', 'push_failed', 'live', 'paused')),
  error_message TEXT,
  error_details JSONB,
  planned_budget NUMERIC,
  planned_impressions NUMERIC,
  planned_reach NUMERIC,
  planned_clicks NUMERIC,
  planned_conversions NUMERIC,
  dsp_status TEXT,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for fast lookups
CREATE INDEX idx_campaign_launch_status_campaign_id ON public.campaign_launch_status(campaign_id);
CREATE INDEX idx_campaign_launch_status_status ON public.campaign_launch_status(status);

-- Enable RLS
ALTER TABLE public.campaign_launch_status ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only see their own campaign launch statuses
CREATE POLICY "Users can view their own campaign launch statuses"
ON public.campaign_launch_status
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own campaign launch statuses"
ON public.campaign_launch_status
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own campaign launch statuses"
ON public.campaign_launch_status
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND c.user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_campaign_launch_status_updated_at
BEFORE UPDATE ON public.campaign_launch_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();