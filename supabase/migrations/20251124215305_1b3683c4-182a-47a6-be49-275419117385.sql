-- TikTok Platform Tables
-- Create connected TikTok accounts table (similar structure to Meta)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, advertiser_id)
);

-- Create TikTok campaigns table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tiktok_campaign_id, advertiser_id)
);

-- Create TikTok ad groups table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tiktok_ad_group_id, advertiser_id)
);

-- Create TikTok creatives table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tiktok_creative_id, advertiser_id)
);

-- Create TikTok daily metrics table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(advertiser_id, tiktok_campaign_id, tiktok_ad_group_id, date)
);

-- Platform Mapping Tables
-- Objectives mapping: Meta -> TikTok
CREATE TABLE IF NOT EXISTS public.platform_objective_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  source_objective TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  target_objective TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_platform, source_objective, target_platform)
);

-- Placement mapping: Meta -> TikTok
CREATE TABLE IF NOT EXISTS public.platform_placement_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  source_placement TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  target_placement TEXT,
  is_supported BOOLEAN DEFAULT true,
  fallback_placement TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_platform, source_placement, target_platform)
);

-- Targeting mapping: Meta interests -> TikTok interests
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_platform, source_targeting_id, target_platform)
);

-- Platform capability gaps tracking
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform, feature_type, feature_name)
);

-- Enable RLS on all TikTok tables
ALTER TABLE public.tiktok_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for TikTok tables
CREATE POLICY "Users can view their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok ad accounts"
  ON public.tiktok_ad_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- TikTok campaigns policies
CREATE POLICY "Users can view their own TikTok campaigns"
  ON public.tiktok_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok campaigns"
  ON public.tiktok_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok campaigns"
  ON public.tiktok_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok campaigns"
  ON public.tiktok_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- TikTok ad groups policies
CREATE POLICY "Users can view their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok ad groups"
  ON public.tiktok_ad_groups FOR DELETE
  USING (auth.uid() = user_id);

-- TikTok creatives policies
CREATE POLICY "Users can view their own TikTok creatives"
  ON public.tiktok_creatives FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok creatives"
  ON public.tiktok_creatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok creatives"
  ON public.tiktok_creatives FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok creatives"
  ON public.tiktok_creatives FOR DELETE
  USING (auth.uid() = user_id);

-- TikTok metrics policies
CREATE POLICY "Users can view their own TikTok metrics"
  ON public.tiktok_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage TikTok metrics"
  ON public.tiktok_metrics FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Enable RLS on mapping tables
ALTER TABLE public.platform_objective_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_placement_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_targeting_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_capability_gaps ENABLE ROW LEVEL SECURITY;

-- Public read access for mapping tables
CREATE POLICY "Anyone can view objective mappings"
  ON public.platform_objective_mapping FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view placement mappings"
  ON public.platform_placement_mapping FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view targeting mappings"
  ON public.platform_targeting_mapping FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view capability gaps"
  ON public.platform_capability_gaps FOR SELECT
  USING (true);

-- Insert initial objective mappings (Meta -> TikTok)
INSERT INTO public.platform_objective_mapping (source_platform, source_objective, target_platform, target_objective, notes) VALUES
('meta', 'OUTCOME_AWARENESS', 'tiktok', 'REACH', 'Awareness campaigns'),
('meta', 'OUTCOME_TRAFFIC', 'tiktok', 'TRAFFIC', 'Traffic to website'),
('meta', 'OUTCOME_ENGAGEMENT', 'tiktok', 'VIDEO_VIEWS', 'Engagement via video views'),
('meta', 'OUTCOME_LEADS', 'tiktok', 'LEAD_GENERATION', 'Lead generation campaigns'),
('meta', 'OUTCOME_SALES', 'tiktok', 'CONVERSIONS', 'Conversion/sales campaigns'),
('meta', 'OUTCOME_APP_PROMOTION', 'tiktok', 'APP_PROMOTION', 'App install campaigns'),
('meta', 'BRAND_AWARENESS', 'tiktok', 'REACH', 'Brand awareness'),
('meta', 'REACH', 'tiktok', 'REACH', 'Reach campaigns'),
('meta', 'LINK_CLICKS', 'tiktok', 'TRAFFIC', 'Link clicks'),
('meta', 'CONVERSIONS', 'tiktok', 'CONVERSIONS', 'Conversions'),
('meta', 'APP_INSTALLS', 'tiktok', 'APP_PROMOTION', 'App installs'),
('meta', 'VIDEO_VIEWS', 'tiktok', 'VIDEO_VIEWS', 'Video views'),
('meta', 'LEAD_GENERATION', 'tiktok', 'LEAD_GENERATION', 'Lead generation');

-- Insert initial placement mappings (Meta -> TikTok)
INSERT INTO public.platform_placement_mapping (source_platform, source_placement, target_platform, target_placement, is_supported, notes) VALUES
('meta', 'feed', 'tiktok', 'PLACEMENT_TIKTOK', true, 'TikTok For You feed'),
('meta', 'story', 'tiktok', 'PLACEMENT_TIKTOK', true, 'Maps to TikTok feed'),
('meta', 'reels', 'tiktok', 'PLACEMENT_TIKTOK', true, 'Similar short-form video'),
('meta', 'video_feeds', 'tiktok', 'PLACEMENT_TIKTOK', true, 'TikTok video feed'),
('meta', 'explore', 'tiktok', 'PLACEMENT_TIKTOK', true, 'TikTok discovery'),
('meta', 'marketplace', 'tiktok', NULL, false, 'Not supported in TikTok'),
('meta', 'messenger', 'tiktok', NULL, false, 'Not supported in TikTok'),
('meta', 'audience_network', 'tiktok', 'PLACEMENT_PANGLE', true, 'Pangle network'),
('meta', 'instagram_stream', 'tiktok', 'PLACEMENT_TIKTOK', true, 'TikTok feed'),
('meta', 'facebook_feed', 'tiktok', 'PLACEMENT_TIKTOK', true, 'TikTok feed');

-- Insert initial capability gaps
INSERT INTO public.platform_capability_gaps (platform, feature_type, feature_name, meta_equivalent, is_supported, fallback_behavior, impact_level, notes) VALUES
('tiktok', 'placement', 'Facebook Marketplace', 'marketplace', false, 'Exclude placement', 'low', 'TikTok does not have marketplace'),
('tiktok', 'placement', 'Messenger', 'messenger', false, 'Exclude placement', 'low', 'TikTok does not have messaging platform'),
('tiktok', 'objective', 'Store Visits', 'STORE_VISITS', false, 'Use TRAFFIC objective', 'medium', 'Map to traffic objective'),
('tiktok', 'objective', 'Catalog Sales', 'PRODUCT_CATALOG_SALES', false, 'Use CONVERSIONS objective', 'medium', 'Map to conversions with catalog'),
('tiktok', 'targeting', 'Lookalike Audiences', 'lookalike', true, 'Use TikTok Lookalike', 'low', 'TikTok supports lookalike audiences'),
('tiktok', 'targeting', 'Custom Audiences', 'custom', true, 'Use TikTok Custom Audiences', 'low', 'TikTok supports custom audiences'),
('tiktok', 'format', 'Carousel Ads', 'carousel', false, 'Use single video', 'medium', 'TikTok primarily supports single video format'),
('tiktok', 'format', 'Collection Ads', 'collection', false, 'Use single video with catalog', 'medium', 'Use video with product links');

-- Create indexes for performance
CREATE INDEX idx_tiktok_ad_accounts_user ON public.tiktok_ad_accounts(user_id);
CREATE INDEX idx_tiktok_ad_accounts_advertiser ON public.tiktok_ad_accounts(advertiser_id);
CREATE INDEX idx_tiktok_campaigns_user ON public.tiktok_campaigns(user_id);
CREATE INDEX idx_tiktok_campaigns_actiplan ON public.tiktok_campaigns(actiplan_campaign_id);
CREATE INDEX idx_tiktok_ad_groups_campaign ON public.tiktok_ad_groups(tiktok_campaign_id);
CREATE INDEX idx_tiktok_metrics_date ON public.tiktok_metrics(date);
CREATE INDEX idx_tiktok_metrics_advertiser ON public.tiktok_metrics(advertiser_id);