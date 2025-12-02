-- Add default_bid_amount column to meta_ad_accounts table
ALTER TABLE meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_bid_amount NUMERIC(10, 2);

COMMENT ON COLUMN meta_ad_accounts.default_bid_amount IS 'Default bid amount in euros for bid strategies that require it (LOWEST_COST_WITH_BID_CAP, COST_CAP)';

-- Add default_bid_amount column to tiktok_ad_accounts table  
ALTER TABLE tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_bid_amount NUMERIC(10, 2);

COMMENT ON COLUMN tiktok_ad_accounts.default_bid_amount IS 'Default bid amount in local currency for bid strategies that require it (COST_CAP, TARGET_COST)';