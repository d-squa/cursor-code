ALTER TABLE public.connected_platforms
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE public.tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    ALTER TABLE public.google_ad_accounts
    ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
  END IF;
END $$;
