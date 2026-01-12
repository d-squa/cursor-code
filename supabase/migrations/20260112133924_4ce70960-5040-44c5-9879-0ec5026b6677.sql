-- Add bc_id column to tiktok_identities to store Business Center ID for BC-linked identities
ALTER TABLE public.tiktok_identities ADD COLUMN IF NOT EXISTS bc_id text;