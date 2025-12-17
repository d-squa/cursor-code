-- Create competitor tracking table
CREATE TABLE public.competitor_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  competitor_name TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'meta' or 'tiktok'
  market TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false,
  active_ad_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ad_details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_competitor_per_client_platform_market 
    UNIQUE (client_id, competitor_name, platform, market)
);

-- Create competitor history table for trend tracking
CREATE TABLE public.competitor_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_tracking_id UUID REFERENCES public.competitor_tracking(id) ON DELETE CASCADE,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  was_live BOOLEAN NOT NULL,
  ad_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for competitor_tracking
CREATE POLICY "Users can view their own competitor tracking"
  ON public.competitor_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own competitor tracking"
  ON public.competitor_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor tracking"
  ON public.competitor_tracking FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own competitor tracking"
  ON public.competitor_tracking FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for competitor_history
CREATE POLICY "Users can view their competitor history"
  ON public.competitor_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.competitor_tracking ct 
    WHERE ct.id = competitor_history.competitor_tracking_id 
    AND ct.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert competitor history"
  ON public.competitor_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.competitor_tracking ct 
    WHERE ct.id = competitor_history.competitor_tracking_id 
    AND ct.user_id = auth.uid()
  ));

-- Indexes for performance
CREATE INDEX idx_competitor_tracking_client ON public.competitor_tracking(client_id);
CREATE INDEX idx_competitor_tracking_user ON public.competitor_tracking(user_id);
CREATE INDEX idx_competitor_tracking_platform_market ON public.competitor_tracking(platform, market);
CREATE INDEX idx_competitor_history_tracking ON public.competitor_history(competitor_tracking_id);
CREATE INDEX idx_competitor_history_checked ON public.competitor_history(checked_at);

-- Update timestamp trigger
CREATE TRIGGER update_competitor_tracking_updated_at
  BEFORE UPDATE ON public.competitor_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();