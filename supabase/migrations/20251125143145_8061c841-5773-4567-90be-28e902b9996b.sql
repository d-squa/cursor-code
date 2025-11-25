-- Add budget type columns to tiktok_ad_accounts table to match Meta functionality
ALTER TABLE tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_budget_type text,
ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text;