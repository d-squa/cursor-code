-- Add default_bid_amount column to tiktok_ad_accounts table
ALTER TABLE tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_bid_amount numeric;