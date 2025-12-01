-- Remove fields that are not needed in defaults section
ALTER TABLE tiktok_ad_accounts
DROP COLUMN IF EXISTS default_frequency_enabled,
DROP COLUMN IF EXISTS default_smart_plus_enabled,
DROP COLUMN IF EXISTS default_search_enabled;