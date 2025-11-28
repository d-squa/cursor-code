-- Add billing_event configuration to TikTok ad accounts
ALTER TABLE tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_billing_event TEXT DEFAULT 'OCPM';

COMMENT ON COLUMN tiktok_ad_accounts.default_billing_event IS 'Default billing event for ad groups: OCPM, CPC, CPV, etc.';