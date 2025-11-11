-- Create campaign_insights table to cache performance data
CREATE TABLE public.campaign_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  ad_account_id TEXT,
  campaign_dsp_id TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  weekly_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, platform)
);

-- Enable RLS
ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;

-- Users can view insights for their own campaigns
CREATE POLICY "Users can view their own campaign insights"
ON public.campaign_insights
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = campaign_insights.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

-- Service role can insert/update insights (for background job)
CREATE POLICY "Service role can manage all insights"
ON public.campaign_insights
FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Create index for faster queries
CREATE INDEX idx_campaign_insights_campaign_id ON public.campaign_insights(campaign_id);
CREATE INDEX idx_campaign_insights_fetched_at ON public.campaign_insights(fetched_at);

-- Add trigger for updated_at
CREATE TRIGGER update_campaign_insights_updated_at
BEFORE UPDATE ON public.campaign_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();