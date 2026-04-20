ALTER TABLE public.creative_assignments
  ADD COLUMN IF NOT EXISTS headline_pins jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS description_pins jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS path_1 text,
  ADD COLUMN IF NOT EXISTS path_2 text,
  ADD COLUMN IF NOT EXISTS final_url_suffix text,
  ADD COLUMN IF NOT EXISTS ad_group_name text,
  ADD COLUMN IF NOT EXISTS ad_strategy text,
  ADD COLUMN IF NOT EXISTS long_headline_1 text,
  ADD COLUMN IF NOT EXISTS long_headline_2 text,
  ADD COLUMN IF NOT EXISTS long_headline_3 text,
  ADD COLUMN IF NOT EXISTS long_headline_4 text,
  ADD COLUMN IF NOT EXISTS long_headline_5 text,
  ADD COLUMN IF NOT EXISTS business_name text;

CREATE INDEX IF NOT EXISTS idx_creative_assignments_ad_group_name
  ON public.creative_assignments(campaign_id, platform, ad_group_name);

CREATE INDEX IF NOT EXISTS idx_creative_assignments_ad_strategy
  ON public.creative_assignments(campaign_id, platform, ad_strategy);