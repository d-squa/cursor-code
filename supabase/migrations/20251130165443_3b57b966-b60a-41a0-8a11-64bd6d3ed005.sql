-- Add default_landing_page_url to tiktok_ad_accounts table
ALTER TABLE tiktok_ad_accounts
ADD COLUMN default_landing_page_url TEXT;