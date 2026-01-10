-- Drop the existing unique constraint that doesn't account for ad sets
ALTER TABLE public.creative_assignments 
DROP CONSTRAINT IF EXISTS creative_assignments_creative_id_campaign_id_platform_marke_key;

-- Add a new unique constraint that includes ad_set_name to allow same creative in different ad sets
-- Using ad_set_name because ad_set_id can be null, and we need a consistent way to differentiate ad sets
-- COALESCE is used to handle null ad_set_name (treating null as 'default')
CREATE UNIQUE INDEX creative_assignments_unique_per_adset 
ON public.creative_assignments (creative_id, campaign_id, platform, market, phase_name, COALESCE(ad_set_name, 'default'));