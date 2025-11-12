-- Add default resource columns to meta_ad_accounts table
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_pixel_id text,
ADD COLUMN IF NOT EXISTS default_page_id text,
ADD COLUMN IF NOT EXISTS default_instagram_account_id text,
ADD COLUMN IF NOT EXISTS default_catalog_id text,
ADD COLUMN IF NOT EXISTS default_conversion_event text;