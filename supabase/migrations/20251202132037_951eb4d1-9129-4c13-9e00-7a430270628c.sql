-- Add TikTok placement fields to tiktok_ad_accounts table
ALTER TABLE public.tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_placement_type text DEFAULT 'PLACEMENT_TYPE_AUTOMATIC',
ADD COLUMN IF NOT EXISTS default_placements jsonb DEFAULT '["PLACEMENT_TIKTOK"]'::jsonb;