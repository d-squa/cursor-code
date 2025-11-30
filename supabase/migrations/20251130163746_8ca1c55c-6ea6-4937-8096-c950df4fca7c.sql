-- Add default optimization event field to TikTok ad accounts table
ALTER TABLE tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_optimization_event TEXT DEFAULT 'ON_WEB_ORDER';