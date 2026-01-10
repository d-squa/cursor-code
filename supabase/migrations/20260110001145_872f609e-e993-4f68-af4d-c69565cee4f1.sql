-- Fix creative_assignments upsert conflicts by making ad_set_name NOT NULL and using a plain UNIQUE constraint
-- (required for PostgREST/Supabase upsert onConflict to work reliably)

BEGIN;

-- Backfill existing rows
UPDATE public.creative_assignments
SET ad_set_name = 'default'
WHERE ad_set_name IS NULL;

-- Ensure future inserts always have a value
ALTER TABLE public.creative_assignments
  ALTER COLUMN ad_set_name SET DEFAULT 'default',
  ALTER COLUMN ad_set_name SET NOT NULL;

-- Replace functional unique index with a plain unique constraint
DROP INDEX IF EXISTS public.creative_assignments_unique_per_adset;

ALTER TABLE public.creative_assignments
  ADD CONSTRAINT creative_assignments_unique_per_adset
  UNIQUE (creative_id, campaign_id, platform, market, phase_name, ad_set_name);

COMMIT;