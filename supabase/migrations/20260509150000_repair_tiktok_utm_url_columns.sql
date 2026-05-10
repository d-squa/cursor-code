-- Repair: PGRST204 on tiktok_ad_accounts.default_url_parameters / default_utm_mode
-- Mirrors 20260309202607 when remote migration history drifted.
ALTER TABLE public.tiktok_ad_accounts
  ADD COLUMN IF NOT EXISTS default_utm_mode text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_url_parameters text DEFAULT NULL;
