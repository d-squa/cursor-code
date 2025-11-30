-- Add bid strategy field to TikTok ad accounts for defaults
ALTER TABLE tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_bid_strategy TEXT DEFAULT 'LOWEST_COST' CHECK (default_bid_strategy IN ('LOWEST_COST', 'COST_CAP'));