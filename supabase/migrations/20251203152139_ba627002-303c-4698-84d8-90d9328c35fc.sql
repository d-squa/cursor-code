-- Add default devices and languages columns to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb;

-- Add default devices and languages columns to tiktok_ad_accounts
ALTER TABLE public.tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb;