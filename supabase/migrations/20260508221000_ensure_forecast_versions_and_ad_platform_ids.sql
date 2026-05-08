-- Ensure forecast_versions exists on projects where early migrations were never applied
-- (fixes PostgREST PGRST205 / GET .../forecast_versions 404).
-- Re-apply platform_id alters idempotently for meta/tiktok ad accounts.

CREATE TABLE IF NOT EXISTS public.forecast_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  forecast_data jsonb NOT NULL,
  platforms_snapshot jsonb NOT NULL,
  total_budget numeric NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  description text,
  UNIQUE (campaign_id, version_number)
);

ALTER TABLE public.forecast_versions
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.forecast_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'forecast_versions'
      AND policyname = 'Users can view their forecast versions'
  ) THEN
    CREATE POLICY "Users can view their forecast versions"
      ON public.forecast_versions FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'forecast_versions'
      AND policyname = 'Users can insert their forecast versions'
  ) THEN
    CREATE POLICY "Users can insert their forecast versions"
      ON public.forecast_versions FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'forecast_versions'
      AND policyname = 'Users can delete their forecast versions'
  ) THEN
    CREATE POLICY "Users can delete their forecast versions"
      ON public.forecast_versions FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, DELETE ON public.forecast_versions TO authenticated;

CREATE INDEX IF NOT EXISTS idx_forecast_versions_campaign_id
  ON public.forecast_versions (campaign_id);

-- Connected-platform linkage on ad account rows (400 when column missing from PostgREST select)
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.connected_platforms(id) ON DELETE SET NULL;

ALTER TABLE public.tiktok_ad_accounts
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.connected_platforms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_platform_id ON public.meta_ad_accounts(platform_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_platform_id ON public.tiktok_ad_accounts(platform_id);
