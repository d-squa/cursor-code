-- Google Ads: new default fields for campaign configuration
ALTER TABLE public.google_ad_accounts
  ADD COLUMN IF NOT EXISTS default_campaign_objective text,
  ADD COLUMN IF NOT EXISTS default_campaign_type text,
  ADD COLUMN IF NOT EXISTS default_campaign_subtype text,
  ADD COLUMN IF NOT EXISTS default_location_targeting text DEFAULT 'PRESENCE_OR_INTEREST',
  ADD COLUMN IF NOT EXISTS default_search_partner boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_display_network boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_customer_acquisition text DEFAULT 'Everyone',
  ADD COLUMN IF NOT EXISTS default_optimized_targeting boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_inventory_type text,
  ADD COLUMN IF NOT EXISTS default_ai_max boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_ai_max_options jsonb DEFAULT '[]'::jsonb;

-- Meta: Advantage+ campaign-level defaults
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS default_advantage_plus_campaign boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_advantage_plus_audience boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_advantage_plus_creative boolean DEFAULT false;