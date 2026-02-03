-- =====================================================
-- COMBINED MIGRATIONS PART 4 - Creative Library & Final
-- =====================================================

-- =====================================================
-- Creatives table and enums
-- =====================================================

CREATE TYPE public.creative_type AS ENUM ('dark_post', 'existing_post', 'image', 'video', 'carousel', 'collection', 'instant_experience');
CREATE TYPE public.creative_status AS ENUM ('draft', 'ready', 'needs_review', 'error', 'published');

CREATE TABLE IF NOT EXISTS public.creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id),
  name TEXT NOT NULL,
  creative_type creative_type NOT NULL DEFAULT 'dark_post',
  status creative_status NOT NULL DEFAULT 'draft',
  platform TEXT NOT NULL,
  market TEXT,
  phase_name TEXT,
  optimization_goal TEXT,
  funnel_stage TEXT,
  media_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  caption TEXT,
  call_to_action TEXT,
  destination_url TEXT,
  external_post_id TEXT,
  external_page_id TEXT,
  external_account_name TEXT,
  platform_metadata JSONB DEFAULT '{}',
  validation_errors TEXT[] DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  folder_path TEXT,
  original_filename TEXT,
  spreadsheet_row_number INTEGER,
  import_batch_id UUID,
  brand_name text,
  campaign_name text,
  product_category text,
  placement text,
  media_type text,
  ad_type text DEFAULT 'paid',
  priority text DEFAULT 'medium',
  approval_status text DEFAULT 'pending_review',
  assigned_to text,
  flight_start_date date,
  flight_end_date date,
  language text DEFAULT 'EN',
  primary_text_ar text,
  headline_ar text,
  description_ar text,
  caption_ar text,
  delivery_deadline date,
  content_pillar text,
  campaign_theme text,
  specs_link text,
  assets_link text,
  platform_video_id TEXT,
  platform_image_hash TEXT,
  platform_thumbnail_id TEXT,
  tiktok_display_name TEXT,
  tiktok_identity_id TEXT,
  tiktok_asset_advertiser_id TEXT,
  tiktok_ad_format TEXT,
  story_image_url TEXT,
  right_column_image_url TEXT,
  headline_2 TEXT,
  headline_3 TEXT,
  headline_4 TEXT,
  headline_5 TEXT,
  primary_text_2 TEXT,
  primary_text_3 TEXT,
  primary_text_4 TEXT,
  primary_text_5 TEXT,
  description_2 TEXT,
  description_3 TEXT,
  description_4 TEXT,
  description_5 TEXT,
  url_parameters TEXT,
  disable_creative_enhancements BOOLEAN DEFAULT false,
  disable_multi_advertiser_ads BOOLEAN DEFAULT false,
  ad_start_time TIMESTAMP WITH TIME ZONE,
  ad_end_time TIMESTAMP WITH TIME ZONE,
  lead_form_id TEXT,
  carousel_cards JSONB DEFAULT '[]'::jsonb,
  instant_experience_id TEXT,
  catalog_id TEXT,
  product_set_id TEXT,
  app_link TEXT,
  deeplink_url TEXT,
  dsp_upload_status TEXT DEFAULT 'pending',
  dsp_upload_error TEXT,
  dsp_uploaded_at TIMESTAMP WITH TIME ZONE,
  creative_origin TEXT DEFAULT 'API_UPLOAD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own creatives" ON public.creatives FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own creatives" ON public.creatives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own creatives" ON public.creatives FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own creatives" ON public.creatives FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Team members can view team creatives" ON public.creatives FOR SELECT USING (team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE INDEX idx_creatives_user_id ON public.creatives(user_id);
CREATE INDEX idx_creatives_campaign_id ON public.creatives(campaign_id);
CREATE INDEX idx_creatives_platform_market ON public.creatives(platform, market);
CREATE INDEX idx_creatives_status ON public.creatives(status);
CREATE INDEX idx_creatives_client_id ON public.creatives(client_id);

CREATE TRIGGER update_creatives_updated_at BEFORE UPDATE ON public.creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Creative assignments
-- =====================================================

CREATE TABLE IF NOT EXISTS public.creative_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES public.creatives(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  market TEXT NOT NULL,
  phase_name TEXT NOT NULL,
  ad_set_id TEXT,
  ad_set_name TEXT NOT NULL DEFAULT 'default',
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  assigned_by UUID REFERENCES auth.users(id),
  position INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  dsp_creative_id TEXT,
  error_message TEXT,
  primary_text text,
  headline text,
  description text,
  call_to_action text,
  destination_url text,
  url_parameters text,
  brand_name text,
  display_name text,
  primary_text_2 text,
  primary_text_3 text,
  primary_text_4 text,
  primary_text_5 text,
  headline_2 text,
  headline_3 text,
  headline_4 text,
  headline_5 text,
  description_2 text,
  description_3 text,
  description_4 text,
  description_5 text,
  advantage_plus_video_touchups boolean,
  advantage_plus_text_improvements boolean,
  advantage_plus_product_tags boolean,
  advantage_plus_video_effects boolean,
  advantage_plus_relevant_comments boolean,
  advantage_plus_enhance_cta boolean,
  advantage_plus_reveal_details boolean,
  advantage_plus_show_spotlights boolean,
  advantage_plus_optimize_text_per_person boolean,
  advantage_plus_sitelinks boolean,
  advantage_plus_products boolean,
  utm_mode text,
  sitelink_url text,
  sitelink_source_url text,
  sitelink_display_label text,
  sitelink_thumbnail text,
  CONSTRAINT creative_assignments_unique_per_adset UNIQUE (creative_id, campaign_id, platform, market, phase_name, ad_set_name)
);

ALTER TABLE public.creative_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_assignments REPLICA IDENTITY FULL;

CREATE INDEX idx_creative_assignments_campaign ON public.creative_assignments(campaign_id);
CREATE INDEX idx_creative_assignments_creative ON public.creative_assignments(creative_id);
CREATE INDEX idx_creative_assignments_ad_set_id ON public.creative_assignments(ad_set_id);

-- =====================================================
-- Creative library assets (platform synced)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.creative_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  platform_asset_id TEXT NOT NULL,
  asset_name TEXT,
  thumbnail_url TEXT,
  preview_url TEXT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  file_size_bytes BIGINT,
  approval_status TEXT DEFAULT 'pending',
  spark_eligible BOOLEAN DEFAULT false,
  is_usable BOOLEAN DEFAULT false,
  platform_metadata JSONB DEFAULT '{}',
  creative_origin TEXT DEFAULT 'UI_SYNC',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, advertiser_id, platform_asset_id)
);

ALTER TABLE public.creative_library_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own creative library assets" ON public.creative_library_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own creative library assets" ON public.creative_library_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own creative library assets" ON public.creative_library_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own creative library assets" ON public.creative_library_assets FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.compute_asset_usability() RETURNS TRIGGER AS $$
BEGIN
  NEW.is_usable := (NEW.approval_status = 'approved');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER compute_asset_usability_trigger BEFORE INSERT OR UPDATE ON public.creative_library_assets FOR EACH ROW EXECUTE FUNCTION public.compute_asset_usability();
CREATE TRIGGER update_creative_library_assets_updated_at BEFORE UPDATE ON public.creative_library_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Platform identities & Ad push configurations
-- =====================================================

CREATE TABLE IF NOT EXISTS public.platform_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  display_name TEXT,
  profile_image_url TEXT,
  is_brand_owned BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  requires_authorization BOOLEAN DEFAULT false,
  platform_metadata JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, advertiser_id, identity_id)
);

ALTER TABLE public.platform_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own platform identities" ON public.platform_identities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own platform identities" ON public.platform_identities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own platform identities" ON public.platform_identities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own platform identities" ON public.platform_identities FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ad_push_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  adgroup_id TEXT,
  creative_asset_id UUID NOT NULL REFERENCES public.creative_library_assets(id) ON DELETE RESTRICT,
  identity_id UUID REFERENCES public.platform_identities(id) ON DELETE SET NULL,
  ad_name TEXT NOT NULL,
  ad_text TEXT,
  call_to_action TEXT,
  landing_page_url TEXT,
  display_name TEXT,
  is_spark_ad BOOLEAN DEFAULT false,
  validation_status TEXT DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]',
  validated_at TIMESTAMPTZ,
  push_status TEXT DEFAULT 'pending',
  push_error TEXT,
  push_attempts INTEGER DEFAULT 0,
  dsp_ad_id TEXT,
  dsp_ad_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  pushed_at TIMESTAMPTZ
);

ALTER TABLE public.ad_push_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own ad configurations" ON public.ad_push_configurations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ad configurations" ON public.ad_push_configurations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ad configurations" ON public.ad_push_configurations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ad configurations" ON public.ad_push_configurations FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- Actiplan time sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.actiplan_time_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_end TIMESTAMP WITH TIME ZONE,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.actiplan_time_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view time sessions for accessible campaigns" ON public.actiplan_time_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = actiplan_time_sessions.campaign_id AND (c.user_id = auth.uid() OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()))));

CREATE POLICY "Users can create their own time sessions" ON public.actiplan_time_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own time sessions" ON public.actiplan_time_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_actiplan_time_sessions_updated_at BEFORE UPDATE ON public.actiplan_time_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Storage bucket for creative assets
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('creative-assets', 'creative-assets', true, 524288000, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = 524288000;

-- Enable realtime for creative_assignments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'creative_assignments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_assignments';
  END IF;
END$$;

-- =====================================================
-- END OF COMBINED MIGRATIONS
-- =====================================================
