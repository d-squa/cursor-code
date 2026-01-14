-- Add column to track which TikTok advertiser the asset was uploaded to
-- This allows us to detect when ads are being pushed to a different advertiser
-- and trigger a re-upload to the correct account
ALTER TABLE public.creatives
ADD COLUMN IF NOT EXISTS tiktok_asset_advertiser_id TEXT;

-- Add index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_creatives_tiktok_asset_advertiser_id 
ON public.creatives(tiktok_asset_advertiser_id) 
WHERE tiktok_asset_advertiser_id IS NOT NULL;

COMMENT ON COLUMN public.creatives.tiktok_asset_advertiser_id IS 'The TikTok advertiser_id where platform_image_hash/platform_video_id was uploaded. Used to detect when re-upload is needed for a different advertiser.';