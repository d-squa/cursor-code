-- Add missing TikTok campaign configuration fields based on official TikTok requirements matrix
-- These fields are required for proper campaign creation per TikTok's advertising objectives

ALTER TABLE tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_optimization_location TEXT,
ADD COLUMN IF NOT EXISTS default_app_name TEXT,
ADD COLUMN IF NOT EXISTS default_app_id TEXT,
ADD COLUMN IF NOT EXISTS default_frequency_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_frequency_schedule INTEGER,
ADD COLUMN IF NOT EXISTS default_click_window INTEGER,
ADD COLUMN IF NOT EXISTS default_view_window INTEGER,
ADD COLUMN IF NOT EXISTS default_event_count_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_smart_plus_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_search_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN tiktok_ad_accounts.default_optimization_location IS 'Optimization location: Website, App, TikTok Shop, Instant Form, TikTok Direct Messages, Instant Messaging Apps, Phone Call, TikTok Instant Page, Website & App';
COMMENT ON COLUMN tiktok_ad_accounts.default_app_name IS 'App name for app-related campaigns (Android, iOS, Messenger, WhatsApp, Zalo, LINE)';
COMMENT ON COLUMN tiktok_ad_accounts.default_app_id IS 'App ID for app-related campaigns';
COMMENT ON COLUMN tiktok_ad_accounts.default_frequency_enabled IS 'Whether frequency capping is enabled';
COMMENT ON COLUMN tiktok_ad_accounts.default_frequency_schedule IS 'Frequency schedule (e.g., 3 impressions per 7 days)';
COMMENT ON COLUMN tiktok_ad_accounts.default_click_window IS 'Click-through attribution window in days (e.g., 7, 28)';
COMMENT ON COLUMN tiktok_ad_accounts.default_view_window IS 'View-through attribution window in days (e.g., 1, 7)';
COMMENT ON COLUMN tiktok_ad_accounts.default_event_count_enabled IS 'Whether to track event count for conversion campaigns';
COMMENT ON COLUMN tiktok_ad_accounts.default_smart_plus_enabled IS 'Whether Smart+ campaigns are enabled';
COMMENT ON COLUMN tiktok_ad_accounts.default_search_enabled IS 'Whether search ads are enabled';