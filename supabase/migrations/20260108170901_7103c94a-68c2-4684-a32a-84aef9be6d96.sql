-- Add Meta Advantage+ creative enhancement fields to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS advantage_plus_video_touchups boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_text_improvements boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_product_tags boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS advantage_plus_video_effects boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_relevant_comments boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_enhance_cta boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_reveal_details boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_show_spotlights boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_optimize_text_per_person boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS advantage_plus_sitelinks boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS advantage_plus_products boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_utm_mode text DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS default_url_parameters text;

-- Add the same fields to creative_assignments for per-assignment overrides
ALTER TABLE public.creative_assignments
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
ADD COLUMN IF NOT EXISTS advantage_plus_products boolean,
ADD COLUMN IF NOT EXISTS utm_mode text,
ADD COLUMN IF NOT EXISTS sitelink_url text,
ADD COLUMN IF NOT EXISTS sitelink_source_url text,
ADD COLUMN IF NOT EXISTS sitelink_display_label text,
ADD COLUMN IF NOT EXISTS sitelink_thumbnail text;

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_creative_assignments_utm_mode ON public.creative_assignments(utm_mode);

-- Add comment for documentation
COMMENT ON COLUMN public.meta_ad_accounts.advantage_plus_video_touchups IS 'Enable Meta Advantage+ video touchups enhancement';
COMMENT ON COLUMN public.meta_ad_accounts.default_utm_mode IS 'auto = system-generated UTM params, manual = custom URL parameters';