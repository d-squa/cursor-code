-- Add text fields to creative_assignments for assignment-specific copy
-- These override the creative's default values when set
ALTER TABLE public.creative_assignments
ADD COLUMN IF NOT EXISTS primary_text text,
ADD COLUMN IF NOT EXISTS primary_text_2 text,
ADD COLUMN IF NOT EXISTS primary_text_3 text,
ADD COLUMN IF NOT EXISTS primary_text_4 text,
ADD COLUMN IF NOT EXISTS primary_text_5 text,
ADD COLUMN IF NOT EXISTS headline text,
ADD COLUMN IF NOT EXISTS headline_2 text,
ADD COLUMN IF NOT EXISTS headline_3 text,
ADD COLUMN IF NOT EXISTS headline_4 text,
ADD COLUMN IF NOT EXISTS headline_5 text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS description_2 text,
ADD COLUMN IF NOT EXISTS description_3 text,
ADD COLUMN IF NOT EXISTS description_4 text,
ADD COLUMN IF NOT EXISTS description_5 text,
ADD COLUMN IF NOT EXISTS call_to_action text,
ADD COLUMN IF NOT EXISTS destination_url text,
ADD COLUMN IF NOT EXISTS url_parameters text,
ADD COLUMN IF NOT EXISTS brand_name text,
ADD COLUMN IF NOT EXISTS display_name text;

-- Add comment explaining the override behavior
COMMENT ON COLUMN public.creative_assignments.primary_text IS 'Assignment-specific primary text, overrides creative.primary_text when set';
COMMENT ON COLUMN public.creative_assignments.headline IS 'Assignment-specific headline, overrides creative.headline when set';
COMMENT ON COLUMN public.creative_assignments.description IS 'Assignment-specific description, overrides creative.description when set';
COMMENT ON COLUMN public.creative_assignments.call_to_action IS 'Assignment-specific CTA, overrides creative.call_to_action when set';
COMMENT ON COLUMN public.creative_assignments.destination_url IS 'Assignment-specific destination URL, overrides creative.destination_url when set';
COMMENT ON COLUMN public.creative_assignments.url_parameters IS 'Assignment-specific URL parameters, overrides creative.url_parameters when set';