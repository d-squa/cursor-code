-- Add creative_origin column to track how creatives were ingested
-- UI_SYNC = synced from TikTok Ads Manager (delivery-eligible)
-- API_UPLOAD = uploaded via API (NOT delivery-eligible for TikTok)

ALTER TABLE public.creatives 
ADD COLUMN IF NOT EXISTS creative_origin TEXT DEFAULT 'API_UPLOAD';

-- Add comment for documentation
COMMENT ON COLUMN public.creatives.creative_origin IS 'Tracks how the creative was ingested: UI_SYNC (from platform UI, delivery-eligible) or API_UPLOAD (via API, not delivery-eligible for TikTok)';

-- Also add to creative_library_assets for platform-synced assets
ALTER TABLE public.creative_library_assets 
ADD COLUMN IF NOT EXISTS creative_origin TEXT DEFAULT 'UI_SYNC';

COMMENT ON COLUMN public.creative_library_assets.creative_origin IS 'Tracks asset origin: UI_SYNC (synced from platform, delivery-eligible) or API_UPLOAD (uploaded via API)';