
ALTER TABLE public.google_ad_accounts
  ADD COLUMN IF NOT EXISTS default_landing_page_url TEXT,
  ADD COLUMN IF NOT EXISTS default_bid_strategy TEXT,
  ADD COLUMN IF NOT EXISTS default_target_cpa NUMERIC,
  ADD COLUMN IF NOT EXISTS default_target_roas NUMERIC,
  ADD COLUMN IF NOT EXISTS default_max_cpc_bid NUMERIC;
