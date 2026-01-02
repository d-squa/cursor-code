-- Add ad set columns to creative_assignments for persistent ad set tracking
ALTER TABLE public.creative_assignments
ADD COLUMN IF NOT EXISTS ad_set_id TEXT,
ADD COLUMN IF NOT EXISTS ad_set_name TEXT;

-- Add index for faster lookups by ad_set
CREATE INDEX IF NOT EXISTS idx_creative_assignments_ad_set_id ON public.creative_assignments(ad_set_id);

-- Comment for documentation
COMMENT ON COLUMN public.creative_assignments.ad_set_id IS 'The ad set identifier this creative is assigned to';
COMMENT ON COLUMN public.creative_assignments.ad_set_name IS 'The taxonomy-generated name of the ad set';