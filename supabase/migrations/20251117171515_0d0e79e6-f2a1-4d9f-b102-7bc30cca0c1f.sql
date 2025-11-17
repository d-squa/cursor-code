-- Add budget type defaults to meta_ad_accounts table
ALTER TABLE meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_budget_type text CHECK (default_conversion_budget_type IN ('daily', 'lifetime')),
ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text CHECK (default_non_conversion_budget_type IN ('daily', 'lifetime'));