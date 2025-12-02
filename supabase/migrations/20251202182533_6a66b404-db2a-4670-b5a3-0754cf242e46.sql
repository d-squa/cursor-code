-- Update default_placements column to default to all three placements for automatic placement
ALTER TABLE tiktok_ad_accounts 
ALTER COLUMN default_placements SET DEFAULT '["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]'::jsonb;