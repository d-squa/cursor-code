ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS client_logo_url text,
ADD COLUMN IF NOT EXISTS agency_logo_url text,
ADD COLUMN IF NOT EXISTS brand_font_color text,
ADD COLUMN IF NOT EXISTS brand_background_color text,
ADD COLUMN IF NOT EXISTS brand_foreground_color text;

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
END
$$;

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
END
$$;

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
END
$$;

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
END
$$;