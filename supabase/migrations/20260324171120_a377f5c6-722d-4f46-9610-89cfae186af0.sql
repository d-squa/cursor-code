
-- Add carousel group tracking to creative_assignments
-- carousel_group_id links multiple assignments as cards in a single carousel ad
-- Card-level fields store per-card text/URL overrides for carousel ads
ALTER TABLE public.creative_assignments
  ADD COLUMN IF NOT EXISTS carousel_group_id TEXT,
  ADD COLUMN IF NOT EXISTS carousel_card_headline TEXT,
  ADD COLUMN IF NOT EXISTS carousel_card_description TEXT,
  ADD COLUMN IF NOT EXISTS carousel_card_website_url TEXT,
  ADD COLUMN IF NOT EXISTS carousel_card_cta TEXT;

-- Index for efficient carousel group lookups during push
CREATE INDEX IF NOT EXISTS idx_creative_assignments_carousel_group 
  ON public.creative_assignments (carousel_group_id) 
  WHERE carousel_group_id IS NOT NULL;
