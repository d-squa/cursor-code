-- Add main_markets field to meta_ad_accounts
ALTER TABLE meta_ad_accounts
ADD COLUMN IF NOT EXISTS main_markets jsonb DEFAULT '[]'::jsonb;