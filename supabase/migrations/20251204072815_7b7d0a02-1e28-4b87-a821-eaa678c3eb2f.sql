
-- Add default age and gender columns to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all';

-- Add default age and gender columns to tiktok_ad_accounts
ALTER TABLE public.tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all';
