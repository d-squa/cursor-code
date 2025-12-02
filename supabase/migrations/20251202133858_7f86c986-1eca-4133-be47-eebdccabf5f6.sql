-- Add default placement fields to meta_ad_accounts table
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_publisher_platforms jsonb DEFAULT '["facebook", "instagram", "audience_network"]'::jsonb,
ADD COLUMN IF NOT EXISTS default_positions jsonb DEFAULT '{}'::jsonb;