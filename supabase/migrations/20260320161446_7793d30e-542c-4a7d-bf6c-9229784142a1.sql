
CREATE TABLE public.forecast_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  forecast_data JSONB NOT NULL,
  platforms_snapshot JSONB NOT NULL,
  total_budget NUMERIC NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE(campaign_id, version_number)
);

ALTER TABLE public.forecast_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their forecast versions"
  ON public.forecast_versions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their forecast versions"
  ON public.forecast_versions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their forecast versions"
  ON public.forecast_versions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
