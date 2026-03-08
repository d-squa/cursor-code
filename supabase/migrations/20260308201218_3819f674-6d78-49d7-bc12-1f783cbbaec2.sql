ALTER TABLE public.google_ad_accounts
  ADD COLUMN IF NOT EXISTS default_merchant_center_id text,
  ADD COLUMN IF NOT EXISTS default_feed_label text,
  ADD COLUMN IF NOT EXISTS default_conversion_budget_type text,
  ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text;