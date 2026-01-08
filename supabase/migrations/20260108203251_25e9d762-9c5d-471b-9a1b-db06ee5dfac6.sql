-- Add default_conversion_count column to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_count text DEFAULT 'all_conversions';