-- Add Meta-specific configuration fields for parity with TikTok
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_billing_event text DEFAULT 'IMPRESSIONS',
ADD COLUMN IF NOT EXISTS default_landing_page_url text,
ADD COLUMN IF NOT EXISTS default_click_window integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS default_view_window integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS default_optimization_location text DEFAULT 'WEBSITE';

-- Add comment for documentation
COMMENT ON COLUMN public.meta_ad_accounts.default_billing_event IS 'Default billing event: IMPRESSIONS, LINK_CLICKS, POST_ENGAGEMENT, etc.';
COMMENT ON COLUMN public.meta_ad_accounts.default_landing_page_url IS 'Default landing page URL for traffic/conversion campaigns';
COMMENT ON COLUMN public.meta_ad_accounts.default_click_window IS 'Attribution window for clicks in days (1, 7, or 28)';
COMMENT ON COLUMN public.meta_ad_accounts.default_view_window IS 'Attribution window for views in days (1 or 7)';
COMMENT ON COLUMN public.meta_ad_accounts.default_optimization_location IS 'Conversion location: WEBSITE, APP, MESSAGING, CALLS';