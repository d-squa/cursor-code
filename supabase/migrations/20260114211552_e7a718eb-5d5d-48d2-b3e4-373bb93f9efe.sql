-- =====================================================
-- CREATIVE MANAGEMENT & AD CREATION PIPELINE v2.0
-- Clean rebuild for TikTok (reference implementation)
-- =====================================================

-- Drop existing tables that will be replaced (if they exist)
-- We're starting fresh as requested

-- =====================================================
-- LAYER 1: CREATIVE LIBRARY ASSETS
-- Platform creative library cache - decoupled from campaigns
-- =====================================================

CREATE TABLE IF NOT EXISTS public.creative_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  
  -- Platform identification
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'meta', 'google')),
  advertiser_id TEXT NOT NULL, -- Platform-specific advertiser/account ID
  
  -- Asset identification
  asset_type TEXT NOT NULL CHECK (asset_type IN ('video', 'image')),
  platform_asset_id TEXT NOT NULL, -- video_id or image_id from platform
  asset_name TEXT,
  
  -- Asset metadata
  thumbnail_url TEXT,
  preview_url TEXT, -- For videos, the playable URL
  duration_seconds NUMERIC, -- For videos
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  file_size_bytes BIGINT,
  
  -- Platform status
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'processing')),
  spark_eligible BOOLEAN DEFAULT false, -- TikTok specific: can be used as Spark Ad
  is_usable BOOLEAN DEFAULT false, -- Computed: approved AND ready for ads
  
  -- Raw platform data
  platform_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint: one asset per platform/advertiser/asset
  UNIQUE (platform, advertiser_id, platform_asset_id)
);

-- Indexes for creative_library_assets
CREATE INDEX idx_cla_user_platform ON public.creative_library_assets(user_id, platform);
CREATE INDEX idx_cla_advertiser ON public.creative_library_assets(advertiser_id);
CREATE INDEX idx_cla_approval ON public.creative_library_assets(approval_status, is_usable);
CREATE INDEX idx_cla_team ON public.creative_library_assets(team_id);

-- RLS for creative_library_assets
ALTER TABLE public.creative_library_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own creative library assets"
  ON public.creative_library_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creative library assets"
  ON public.creative_library_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creative library assets"
  ON public.creative_library_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creative library assets"
  ON public.creative_library_assets FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LAYER 2: PLATFORM IDENTITIES
-- Brand/creator identities for ad delivery
-- =====================================================

CREATE TABLE IF NOT EXISTS public.platform_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  
  -- Platform identification
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'meta', 'google')),
  advertiser_id TEXT NOT NULL,
  
  -- Identity details
  identity_id TEXT NOT NULL, -- Platform-specific identity ID
  identity_type TEXT NOT NULL, -- TikTok: BC_AUTH_TT, TT_ACCOUNT, CUSTOMIZED_USER, AUTH_CODE
  display_name TEXT,
  profile_image_url TEXT,
  
  -- Ownership and status
  is_brand_owned BOOLEAN DEFAULT false, -- true = owned by BC, no creator auth needed
  is_active BOOLEAN DEFAULT true,
  requires_authorization BOOLEAN DEFAULT false, -- true = needs creator auth flow
  
  -- Raw platform data
  platform_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint
  UNIQUE (platform, advertiser_id, identity_id)
);

-- Indexes for platform_identities
CREATE INDEX idx_pi_user_platform ON public.platform_identities(user_id, platform);
CREATE INDEX idx_pi_advertiser ON public.platform_identities(advertiser_id);
CREATE INDEX idx_pi_active ON public.platform_identities(is_active, is_brand_owned);
CREATE INDEX idx_pi_team ON public.platform_identities(team_id);

-- RLS for platform_identities
ALTER TABLE public.platform_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own platform identities"
  ON public.platform_identities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own platform identities"
  ON public.platform_identities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own platform identities"
  ON public.platform_identities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform identities"
  ON public.platform_identities FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LAYER 3: AD PUSH CONFIGURATIONS
-- Validated, ready-to-push ad configurations
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ad_push_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  -- Platform identification
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'meta', 'google')),
  advertiser_id TEXT NOT NULL,
  adgroup_id TEXT, -- Platform ad group/ad set ID
  
  -- References to validated assets and identity
  creative_asset_id UUID NOT NULL REFERENCES public.creative_library_assets(id) ON DELETE RESTRICT,
  identity_id UUID REFERENCES public.platform_identities(id) ON DELETE SET NULL,
  
  -- Ad configuration
  ad_name TEXT NOT NULL,
  ad_text TEXT,
  call_to_action TEXT,
  landing_page_url TEXT,
  display_name TEXT, -- TikTok display name override
  
  -- Ad type
  is_spark_ad BOOLEAN DEFAULT false, -- Explicit opt-in for Spark Ads
  
  -- Validation state
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_errors JSONB DEFAULT '[]',
  validated_at TIMESTAMPTZ,
  
  -- Push state
  push_status TEXT DEFAULT 'pending' CHECK (push_status IN ('pending', 'pushing', 'success', 'failed', 'paused')),
  push_error TEXT,
  push_attempts INTEGER DEFAULT 0,
  
  -- Result
  dsp_ad_id TEXT, -- Returned ad ID from platform
  dsp_ad_status TEXT, -- Platform ad status
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  pushed_at TIMESTAMPTZ
);

-- Indexes for ad_push_configurations
CREATE INDEX idx_apc_user_campaign ON public.ad_push_configurations(user_id, campaign_id);
CREATE INDEX idx_apc_platform ON public.ad_push_configurations(platform, advertiser_id);
CREATE INDEX idx_apc_validation ON public.ad_push_configurations(validation_status);
CREATE INDEX idx_apc_push ON public.ad_push_configurations(push_status);
CREATE INDEX idx_apc_team ON public.ad_push_configurations(team_id);

-- RLS for ad_push_configurations
ALTER TABLE public.ad_push_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad configurations"
  ON public.ad_push_configurations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ad configurations"
  ON public.ad_push_configurations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ad configurations"
  ON public.ad_push_configurations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad configurations"
  ON public.ad_push_configurations FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LAYER 4: AD PUSH LOGS
-- Audit trail for all ad creation attempts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ad_push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_config_id UUID REFERENCES public.ad_push_configurations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Action details
  action TEXT NOT NULL, -- 'validate', 'push', 'retry', 'cancel'
  status TEXT NOT NULL, -- 'success', 'failed'
  
  -- Request/Response
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  error_code TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for ad_push_logs
CREATE INDEX idx_apl_config ON public.ad_push_logs(ad_config_id);
CREATE INDEX idx_apl_user ON public.ad_push_logs(user_id);
CREATE INDEX idx_apl_created ON public.ad_push_logs(created_at DESC);

-- RLS for ad_push_logs
ALTER TABLE public.ad_push_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad push logs"
  ON public.ad_push_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ad push logs"
  ON public.ad_push_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at on creative_library_assets
CREATE TRIGGER update_creative_library_assets_updated_at
  BEFORE UPDATE ON public.creative_library_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update updated_at on platform_identities
CREATE TRIGGER update_platform_identities_updated_at
  BEFORE UPDATE ON public.platform_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update updated_at on ad_push_configurations
CREATE TRIGGER update_ad_push_configurations_updated_at
  BEFORE UPDATE ON public.ad_push_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- HELPER FUNCTION: Auto-compute is_usable
-- =====================================================

CREATE OR REPLACE FUNCTION public.compute_asset_usability()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_usable := (NEW.approval_status = 'approved');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER compute_asset_usability_trigger
  BEFORE INSERT OR UPDATE ON public.creative_library_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_asset_usability();