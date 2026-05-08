-- Remote projects may have google_ad_accounts without later default_* columns → REST select returns 400.
-- Ensure branding bucket + policies exist for Client Management uploads.

DO $$
BEGIN
  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    ALTER TABLE public.google_ad_accounts
      ADD COLUMN IF NOT EXISTS main_markets jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS default_landing_page_url text,
      ADD COLUMN IF NOT EXISTS default_bid_strategy text,
      ADD COLUMN IF NOT EXISTS default_target_cpa numeric,
      ADD COLUMN IF NOT EXISTS default_target_roas numeric,
      ADD COLUMN IF NOT EXISTS default_max_cpc_bid numeric,
      ADD COLUMN IF NOT EXISTS default_merchant_center_id text,
      ADD COLUMN IF NOT EXISTS default_feed_label text,
      ADD COLUMN IF NOT EXISTS default_conversion_budget_type text,
      ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text,
      ADD COLUMN IF NOT EXISTS default_utm_mode text,
      ADD COLUMN IF NOT EXISTS default_url_parameters text,
      ADD COLUMN IF NOT EXISTS default_placements jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS default_campaign_objective text,
      ADD COLUMN IF NOT EXISTS default_campaign_type text,
      ADD COLUMN IF NOT EXISTS default_campaign_subtype text,
      ADD COLUMN IF NOT EXISTS default_location_targeting text DEFAULT 'PRESENCE_OR_INTEREST',
      ADD COLUMN IF NOT EXISTS default_search_partner boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS default_display_network boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS default_customer_acquisition text DEFAULT 'Everyone',
      ADD COLUMN IF NOT EXISTS default_optimized_targeting boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS default_inventory_type text,
      ADD COLUMN IF NOT EXISTS default_ai_max boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS default_ai_max_options jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS default_brand_guidelines boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS default_business_name text,
      ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-branding-assets', 'client-branding-assets', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Client branding assets are publicly viewable'
  ) THEN
    CREATE POLICY "Client branding assets are publicly viewable"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'client-branding-assets');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload their own client branding assets'
  ) THEN
    CREATE POLICY "Users can upload their own client branding assets"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'client-branding-assets'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update their own client branding assets'
  ) THEN
    CREATE POLICY "Users can update their own client branding assets"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'client-branding-assets'
      AND auth.uid()::text = (storage.foldername(name))[1]
    )
    WITH CHECK (
      bucket_id = 'client-branding-assets'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete their own client branding assets'
  ) THEN
    CREATE POLICY "Users can delete their own client branding assets"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'client-branding-assets'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;
