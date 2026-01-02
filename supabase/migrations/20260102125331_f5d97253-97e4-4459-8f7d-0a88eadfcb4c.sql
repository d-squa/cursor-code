-- Add DSP-required fields for creative push to Meta and TikTok

-- Platform-specific IDs after upload
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS platform_video_id TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS platform_image_hash TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS platform_thumbnail_id TEXT;

-- TikTok-specific identity fields
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS tiktok_display_name TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS tiktok_identity_id TEXT;

-- Meta-specific placement images
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS story_image_url TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS right_column_image_url TEXT;

-- Multiple headlines support (Meta supports up to 5)
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS headline_2 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS headline_3 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS headline_4 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS headline_5 TEXT;

-- Multiple primary text support (Meta supports up to 5)
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS primary_text_2 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS primary_text_3 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS primary_text_4 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS primary_text_5 TEXT;

-- Multiple descriptions support (Meta supports up to 5)  
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS description_2 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS description_3 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS description_4 TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS description_5 TEXT;

-- URL tracking parameters
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS url_parameters TEXT;

-- Meta creative control flags
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS disable_creative_enhancements BOOLEAN DEFAULT false;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS disable_multi_advertiser_ads BOOLEAN DEFAULT false;

-- Ad scheduling (Meta supports ad-level start/end)
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS ad_start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS ad_end_time TIMESTAMP WITH TIME ZONE;

-- Lead form support (Meta lead gen)
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS lead_form_id TEXT;

-- Carousel/Collection specific fields
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS carousel_cards JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS instant_experience_id TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS catalog_id TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS product_set_id TEXT;

-- Deep link support (app promotion)
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS app_link TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS deeplink_url TEXT;

-- TikTok ad format
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS tiktok_ad_format TEXT;

-- Track upload status to DSP
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS dsp_upload_status TEXT DEFAULT 'pending';
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS dsp_upload_error TEXT;
ALTER TABLE public.creatives ADD COLUMN IF NOT EXISTS dsp_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_creatives_dsp_upload_status ON public.creatives(dsp_upload_status);
CREATE INDEX IF NOT EXISTS idx_creatives_platform_video_id ON public.creatives(platform_video_id) WHERE platform_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creatives_platform_image_hash ON public.creatives(platform_image_hash) WHERE platform_image_hash IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.creatives.platform_video_id IS 'Platform-specific video ID after upload to Meta or TikTok';
COMMENT ON COLUMN public.creatives.platform_image_hash IS 'Meta image hash after upload to ad account';
COMMENT ON COLUMN public.creatives.tiktok_display_name IS 'Display name shown on TikTok ads (custom identity)';
COMMENT ON COLUMN public.creatives.tiktok_identity_id IS 'TikTok identity ID for Spark Ads or custom identity';
COMMENT ON COLUMN public.creatives.story_image_url IS 'Specific image for Meta Stories/Reels placements';
COMMENT ON COLUMN public.creatives.right_column_image_url IS 'Specific image for Meta Right Column placement';
COMMENT ON COLUMN public.creatives.carousel_cards IS 'Array of carousel card objects with individual links, images, headlines';
COMMENT ON COLUMN public.creatives.dsp_upload_status IS 'Status of asset upload to DSP: pending, uploading, uploaded, error';