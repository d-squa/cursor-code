-- Add bid strategy field to Meta ad accounts
ALTER TABLE meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_bid_strategy TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP';