
ALTER TABLE public.meta_ad_accounts ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tiktok_ad_accounts ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.google_ad_accounts ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.snapchat_ad_accounts ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_is_sample ON public.meta_ad_accounts(is_sample) WHERE is_sample = true;
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_is_sample ON public.tiktok_ad_accounts(is_sample) WHERE is_sample = true;
CREATE INDEX IF NOT EXISTS idx_google_ad_accounts_is_sample ON public.google_ad_accounts(is_sample) WHERE is_sample = true;
CREATE INDEX IF NOT EXISTS idx_snapchat_ad_accounts_is_sample ON public.snapchat_ad_accounts(is_sample) WHERE is_sample = true;
