-- Repair: remote PostgREST PGRST204 on tiktok_ad_accounts.default_conversion_count
-- (idempotent; safe if column already exists from 20260108203331)
ALTER TABLE public.tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS default_conversion_count text DEFAULT 'all_conversions';

COMMENT ON COLUMN public.tiktok_ad_accounts.default_conversion_count IS
  'Meta-style conversion counting preference mirrored for TikTok account defaults; e.g. all_conversions';
