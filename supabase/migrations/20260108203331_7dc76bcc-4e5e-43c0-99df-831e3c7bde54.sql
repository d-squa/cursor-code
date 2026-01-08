-- Add default_conversion_count column to tiktok_ad_accounts
ALTER TABLE public.tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_count text DEFAULT 'all_conversions';