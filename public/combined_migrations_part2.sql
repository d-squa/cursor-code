-- =====================================================
-- COMBINED MIGRATIONS PART 2 - TikTok & Platform Features
-- SAFE TO RE-RUN: Uses IF NOT EXISTS and DROP IF EXISTS
-- =====================================================

-- =====================================================
-- 20251124215305 - TikTok Platform Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tiktok_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  account_status TEXT,
  currency TEXT,
  timezone TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  main_markets JSONB DEFAULT '[]'::jsonb,
  default_pixel_id TEXT,
  default_identity_id TEXT,
  default_catalog_id TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_ad_accounts ADD CONSTRAINT tiktok_ad_accounts_user_advertiser_key UNIQUE(user_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actiplan_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  tiktok_campaign_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  objective_type TEXT NOT NULL,
  budget_mode TEXT,
  budget NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_campaigns ADD CONSTRAINT tiktok_campaigns_id_advertiser_key UNIQUE(tiktok_campaign_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_ad_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_campaign_id UUID REFERENCES public.tiktok_campaigns(id) ON DELETE CASCADE,
  tiktok_ad_group_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  ad_group_name TEXT NOT NULL,
  placement_type TEXT,
  placements JSONB,
  targeting JSONB,
  budget NUMERIC,
  budget_mode TEXT,
  optimization_goal TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_ad_groups ADD CONSTRAINT tiktok_ad_groups_id_advertiser_key UNIQUE(tiktok_ad_group_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_ad_group_id UUID REFERENCES public.tiktok_ad_groups(id) ON DELETE CASCADE,
  tiktok_creative_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  creative_name TEXT NOT NULL,
  creative_type TEXT,
  video_id TEXT,
  image_ids JSONB,
  ad_text TEXT,
  call_to_action TEXT,
  landing_page_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_creatives ADD CONSTRAINT tiktok_creatives_id_advertiser_key UNIQUE(tiktok_creative_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  tiktok_campaign_id TEXT,
  tiktok_ad_group_id TEXT,
  date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  conversions BIGINT DEFAULT 0,
  video_views BIGINT DEFAULT 0,
  video_play_actions BIGINT DEFAULT 0,
  ctr NUMERIC,
  cpc NUMERIC,
  cpm NUMERIC,
  raw_metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_metrics ADD CONSTRAINT tiktok_metrics_unique_key UNIQUE(advertiser_id, tiktok_campaign_id, tiktok_ad_group_id, date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Platform Mapping Tables
CREATE TABLE IF NOT EXISTS public.platform_objective_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  source_objective TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  target_objective TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.platform_objective_mapping ADD CONSTRAINT platform_objective_mapping_unique UNIQUE(source_platform, source_objective, target_platform);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_placement_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  source_placement TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  target_placement TEXT,
  is_supported BOOLEAN DEFAULT true,
  fallback_placement TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.platform_placement_mapping ADD CONSTRAINT platform_placement_mapping_unique UNIQUE(source_platform, source_placement, target_platform);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_targeting_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  source_targeting_type TEXT NOT NULL,
  source_targeting_id TEXT NOT NULL,
  source_targeting_name TEXT,
  target_platform TEXT NOT NULL,
  target_targeting_id TEXT,
  target_targeting_name TEXT,
  is_supported BOOLEAN DEFAULT true,
  fallback_strategy TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.platform_targeting_mapping ADD CONSTRAINT platform_targeting_mapping_unique UNIQUE(source_platform, source_targeting_id, target_platform);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_capability_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  meta_equivalent TEXT,
  is_supported BOOLEAN DEFAULT false,
  fallback_behavior TEXT,
  impact_level TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.platform_capability_gaps ADD CONSTRAINT platform_capability_gaps_unique UNIQUE(platform, feature_type, feature_name);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS on TikTok tables
ALTER TABLE public.tiktok_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for TikTok tables
DROP POLICY IF EXISTS "Users can view their own TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can view their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can insert their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can update their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can delete their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok campaigns" ON public.tiktok_campaigns;
CREATE POLICY "Users can view their own TikTok campaigns"
  ON public.tiktok_campaigns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok campaigns" ON public.tiktok_campaigns;
CREATE POLICY "Users can insert their own TikTok campaigns"
  ON public.tiktok_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok campaigns" ON public.tiktok_campaigns;
CREATE POLICY "Users can update their own TikTok campaigns"
  ON public.tiktok_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok campaigns" ON public.tiktok_campaigns;
CREATE POLICY "Users can delete their own TikTok campaigns"
  ON public.tiktok_campaigns FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok ad groups" ON public.tiktok_ad_groups;
CREATE POLICY "Users can view their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok ad groups" ON public.tiktok_ad_groups;
CREATE POLICY "Users can insert their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok ad groups" ON public.tiktok_ad_groups;
CREATE POLICY "Users can update their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok ad groups" ON public.tiktok_ad_groups;
CREATE POLICY "Users can delete their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok creatives" ON public.tiktok_creatives;
CREATE POLICY "Users can view their own TikTok creatives"
  ON public.tiktok_creatives FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok creatives" ON public.tiktok_creatives;
CREATE POLICY "Users can insert their own TikTok creatives"
  ON public.tiktok_creatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok creatives" ON public.tiktok_creatives;
CREATE POLICY "Users can update their own TikTok creatives"
  ON public.tiktok_creatives FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok creatives" ON public.tiktok_creatives;
CREATE POLICY "Users can delete their own TikTok creatives"
  ON public.tiktok_creatives FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok metrics" ON public.tiktok_metrics;
CREATE POLICY "Users can view their own TikTok metrics"
  ON public.tiktok_metrics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage TikTok metrics" ON public.tiktok_metrics;
CREATE POLICY "Service role can manage TikTok metrics"
  ON public.tiktok_metrics FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Enable RLS on mapping tables
ALTER TABLE public.platform_objective_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_placement_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_targeting_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_capability_gaps ENABLE ROW LEVEL SECURITY;

-- Public read access for mapping tables
DROP POLICY IF EXISTS "Anyone can view objective mappings" ON public.platform_objective_mapping;
CREATE POLICY "Anyone can view objective mappings"
  ON public.platform_objective_mapping FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can view placement mappings" ON public.platform_placement_mapping;
CREATE POLICY "Anyone can view placement mappings"
  ON public.platform_placement_mapping FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can view targeting mappings" ON public.platform_targeting_mapping;
CREATE POLICY "Anyone can view targeting mappings"
  ON public.platform_targeting_mapping FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can view capability gaps" ON public.platform_capability_gaps;
CREATE POLICY "Anyone can view capability gaps"
  ON public.platform_capability_gaps FOR SELECT
  USING (true);

-- Indexes for TikTok tables
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_user ON public.tiktok_ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_advertiser ON public.tiktok_ad_accounts(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_campaigns_user ON public.tiktok_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_campaigns_actiplan ON public.tiktok_campaigns(actiplan_campaign_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_groups_campaign ON public.tiktok_ad_groups(tiktok_campaign_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_metrics_date ON public.tiktok_metrics(date);
CREATE INDEX IF NOT EXISTS idx_tiktok_metrics_advertiser ON public.tiktok_metrics(advertiser_id);

-- =====================================================
-- 20251125105904 - TikTok pixels, identities, catalogs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tiktok_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  pixel_id TEXT NOT NULL,
  pixel_name TEXT NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_pixels ADD CONSTRAINT tiktok_pixels_unique UNIQUE(pixel_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  identity_name TEXT NOT NULL,
  identity_type TEXT,
  bc_id TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_identities ADD CONSTRAINT tiktok_identities_unique UNIQUE(identity_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  catalog_name TEXT NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_catalogs ADD CONSTRAINT tiktok_catalogs_unique UNIQUE(catalog_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.tiktok_pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own TikTok pixels" ON public.tiktok_pixels;
CREATE POLICY "Users can view their own TikTok pixels"
ON public.tiktok_pixels FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok pixels" ON public.tiktok_pixels;
CREATE POLICY "Users can insert their own TikTok pixels"
ON public.tiktok_pixels FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok pixels" ON public.tiktok_pixels;
CREATE POLICY "Users can update their own TikTok pixels"
ON public.tiktok_pixels FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok pixels" ON public.tiktok_pixels;
CREATE POLICY "Users can delete their own TikTok pixels"
ON public.tiktok_pixels FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok identities" ON public.tiktok_identities;
CREATE POLICY "Users can view their own TikTok identities"
ON public.tiktok_identities FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok identities" ON public.tiktok_identities;
CREATE POLICY "Users can insert their own TikTok identities"
ON public.tiktok_identities FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok identities" ON public.tiktok_identities;
CREATE POLICY "Users can update their own TikTok identities"
ON public.tiktok_identities FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok identities" ON public.tiktok_identities;
CREATE POLICY "Users can delete their own TikTok identities"
ON public.tiktok_identities FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own TikTok catalogs" ON public.tiktok_catalogs;
CREATE POLICY "Users can view their own TikTok catalogs"
ON public.tiktok_catalogs FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok catalogs" ON public.tiktok_catalogs;
CREATE POLICY "Users can insert their own TikTok catalogs"
ON public.tiktok_catalogs FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok catalogs" ON public.tiktok_catalogs;
CREATE POLICY "Users can update their own TikTok catalogs"
ON public.tiktok_catalogs FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok catalogs" ON public.tiktok_catalogs;
CREATE POLICY "Users can delete their own TikTok catalogs"
ON public.tiktok_catalogs FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- TikTok account default columns
-- =====================================================

ALTER TABLE tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_budget_type text,
ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text;

-- =====================================================
-- TikTok product sets
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tiktok_product_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  product_set_id TEXT NOT NULL,
  product_set_name TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_product_sets ADD CONSTRAINT tiktok_product_sets_unique UNIQUE(product_set_id, advertiser_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.tiktok_product_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own TikTok product sets" ON public.tiktok_product_sets;
CREATE POLICY "Users can view their own TikTok product sets"
  ON public.tiktok_product_sets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok product sets" ON public.tiktok_product_sets;
CREATE POLICY "Users can insert their own TikTok product sets"
  ON public.tiktok_product_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok product sets" ON public.tiktok_product_sets;
CREATE POLICY "Users can update their own TikTok product sets"
  ON public.tiktok_product_sets FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok product sets" ON public.tiktok_product_sets;
CREATE POLICY "Users can delete their own TikTok product sets"
  ON public.tiktok_product_sets FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE public.tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_product_set_id TEXT;

-- =====================================================
-- Additional TikTok account columns
-- =====================================================

ALTER TABLE tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_billing_event TEXT DEFAULT 'OCPM',
ADD COLUMN IF NOT EXISTS default_optimization_event TEXT DEFAULT 'ON_WEB_ORDER',
ADD COLUMN IF NOT EXISTS default_landing_page_url TEXT,
ADD COLUMN IF NOT EXISTS default_bid_amount numeric,
ADD COLUMN IF NOT EXISTS default_bid_strategy TEXT DEFAULT 'LOWEST_COST',
ADD COLUMN IF NOT EXISTS default_optimization_location TEXT,
ADD COLUMN IF NOT EXISTS default_app_name TEXT,
ADD COLUMN IF NOT EXISTS default_app_id TEXT,
ADD COLUMN IF NOT EXISTS default_frequency_schedule INTEGER,
ADD COLUMN IF NOT EXISTS default_click_window INTEGER,
ADD COLUMN IF NOT EXISTS default_view_window INTEGER,
ADD COLUMN IF NOT EXISTS default_event_count_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_placement_type text DEFAULT 'PLACEMENT_TYPE_AUTOMATIC',
ADD COLUMN IF NOT EXISTS default_placements jsonb DEFAULT '["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]'::jsonb,
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS default_messaging_app text,
ADD COLUMN IF NOT EXISTS default_facebook_page_id text,
ADD COLUMN IF NOT EXISTS default_message_event_set text,
ADD COLUMN IF NOT EXISTS default_whatsapp_number text,
ADD COLUMN IF NOT EXISTS default_zalo_account_id text,
ADD COLUMN IF NOT EXISTS default_line_business_id text;

-- =====================================================
-- Additional Meta account columns
-- =====================================================

ALTER TABLE meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_bid_strategy TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP',
ADD COLUMN IF NOT EXISTS default_bid_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS default_publisher_platforms jsonb DEFAULT '["facebook", "instagram", "audience_network"]'::jsonb,
ADD COLUMN IF NOT EXISTS default_positions jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS default_advantage_plus_placements boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS default_billing_event text DEFAULT 'IMPRESSIONS',
ADD COLUMN IF NOT EXISTS default_landing_page_url text,
ADD COLUMN IF NOT EXISTS default_click_window integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS default_view_window integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS default_optimization_location text DEFAULT 'WEBSITE',
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS default_app_store text,
ADD COLUMN IF NOT EXISTS default_app_id text,
ADD COLUMN IF NOT EXISTS default_whatsapp_number text,
ADD COLUMN IF NOT EXISTS default_messaging_mode text DEFAULT 'AUTOMATIC',
ADD COLUMN IF NOT EXISTS default_messenger_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_instagram_dm_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_whatsapp_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_conversion_count TEXT,
ADD COLUMN IF NOT EXISTS default_url_parameters TEXT,
ADD COLUMN IF NOT EXISTS default_utm_mode TEXT;

-- =====================================================
-- Client targeting defaults
-- =====================================================

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- Taxonomy templates
-- =====================================================

CREATE TABLE IF NOT EXISTS public.taxonomy_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id UUID NOT NULL,
  platform TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  template JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.taxonomy_templates ADD CONSTRAINT taxonomy_templates_unique UNIQUE (ad_account_id, entity_type);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.taxonomy_templates ADD CONSTRAINT taxonomy_templates_platform_check CHECK (platform IN ('meta', 'tiktok'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.taxonomy_templates ADD CONSTRAINT taxonomy_templates_entity_type_check CHECK (entity_type IN ('campaign', 'adset', 'ad'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.taxonomy_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own taxonomy templates" ON public.taxonomy_templates;
CREATE POLICY "Users can view their own taxonomy templates"
ON public.taxonomy_templates
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own taxonomy templates" ON public.taxonomy_templates;
CREATE POLICY "Users can create their own taxonomy templates"
ON public.taxonomy_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own taxonomy templates" ON public.taxonomy_templates;
CREATE POLICY "Users can update their own taxonomy templates"
ON public.taxonomy_templates
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own taxonomy templates" ON public.taxonomy_templates;
CREATE POLICY "Users can delete their own taxonomy templates"
ON public.taxonomy_templates
FOR DELETE
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_taxonomy_templates_updated_at ON public.taxonomy_templates;
CREATE TRIGGER update_taxonomy_templates_updated_at
BEFORE UPDATE ON public.taxonomy_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Meta Advantage Plus settings
-- =====================================================

ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS advantage_plus_video_touchups boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_text_improvements boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_product_tags boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_video_effects boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_relevant_comments boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_enhance_cta boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_reveal_details boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_show_spotlights boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_optimize_text_per_person boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_sitelinks boolean,
ADD COLUMN IF NOT EXISTS advantage_plus_products boolean;

-- =====================================================
-- END OF PART 2
-- =====================================================
