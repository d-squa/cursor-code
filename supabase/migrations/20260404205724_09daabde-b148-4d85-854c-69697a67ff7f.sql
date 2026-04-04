-- Add is_sample flag to key tables
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.connected_platforms ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.campaign_change_history ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.campaign_insights ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.campaign_launch_status ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.creative_assignments ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.creative_library_assets ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- Create tour_data_state table
CREATE TABLE IF NOT EXISTS public.tour_data_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_seeded boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  seeded_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  seeded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_data_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tour state"
  ON public.tour_data_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tour state"
  ON public.tour_data_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tour state"
  ON public.tour_data_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_tour_data_state_updated_at
  BEFORE UPDATE ON public.tour_data_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for is_sample filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_is_sample ON public.campaigns(is_sample) WHERE is_sample = true;
CREATE INDEX IF NOT EXISTS idx_connected_platforms_is_sample ON public.connected_platforms(is_sample) WHERE is_sample = true;