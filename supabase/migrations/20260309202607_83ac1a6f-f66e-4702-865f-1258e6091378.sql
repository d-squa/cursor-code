
ALTER TABLE public.tiktok_ad_accounts
  ADD COLUMN IF NOT EXISTS default_utm_mode text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_url_parameters text DEFAULT NULL;

ALTER TABLE public.google_ad_accounts
  ADD COLUMN IF NOT EXISTS default_utm_mode text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_url_parameters text DEFAULT NULL;
