-- Backfill missing clients columns required by CSV import.
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS qc_enforce_individual boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS client_logo_url text,
ADD COLUMN IF NOT EXISTS agency_logo_url text,
ADD COLUMN IF NOT EXISTS brand_font_color text,
ADD COLUMN IF NOT EXISTS brand_background_color text,
ADD COLUMN IF NOT EXISTS brand_foreground_color text;
