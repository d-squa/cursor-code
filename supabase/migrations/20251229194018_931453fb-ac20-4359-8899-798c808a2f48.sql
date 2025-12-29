-- Add missing content calendar fields to creatives table
ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS placement text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS ad_type text DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS flight_start_date date,
  ADD COLUMN IF NOT EXISTS flight_end_date date,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'EN',
  ADD COLUMN IF NOT EXISTS primary_text_ar text,
  ADD COLUMN IF NOT EXISTS headline_ar text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS caption_ar text,
  ADD COLUMN IF NOT EXISTS delivery_deadline date,
  ADD COLUMN IF NOT EXISTS content_pillar text,
  ADD COLUMN IF NOT EXISTS campaign_theme text,
  ADD COLUMN IF NOT EXISTS specs_link text,
  ADD COLUMN IF NOT EXISTS assets_link text,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_creatives_client_id ON public.creatives(client_id);
CREATE INDEX IF NOT EXISTS idx_creatives_brand_name ON public.creatives(brand_name);
CREATE INDEX IF NOT EXISTS idx_creatives_campaign_name ON public.creatives(campaign_name);
CREATE INDEX IF NOT EXISTS idx_creatives_flight_dates ON public.creatives(flight_start_date, flight_end_date);

COMMENT ON COLUMN public.creatives.brand_name IS 'Brand or product line name';
COMMENT ON COLUMN public.creatives.campaign_name IS 'Campaign name this creative belongs to';
COMMENT ON COLUMN public.creatives.product_category IS 'Product category (e.g., Leathergoods, Bags)';
COMMENT ON COLUMN public.creatives.placement IS 'Ad placement (Feed, Stories, Reels, etc.)';
COMMENT ON COLUMN public.creatives.media_type IS 'Type of media (Video, Image, GIF, Carousel)';
COMMENT ON COLUMN public.creatives.ad_type IS 'Type of ad (Paid, Organic, Spark)';
COMMENT ON COLUMN public.creatives.priority IS 'Priority level (High, Medium, Low)';
COMMENT ON COLUMN public.creatives.approval_status IS 'Approval workflow status';
COMMENT ON COLUMN public.creatives.assigned_to IS 'Team member assigned to this creative';
COMMENT ON COLUMN public.creatives.flight_start_date IS 'Campaign flight start date';
COMMENT ON COLUMN public.creatives.flight_end_date IS 'Campaign flight end date';
COMMENT ON COLUMN public.creatives.language IS 'Primary language code (EN, AR, EN/AR)';
COMMENT ON COLUMN public.creatives.primary_text_ar IS 'Arabic version of primary text';
COMMENT ON COLUMN public.creatives.headline_ar IS 'Arabic version of headline';
COMMENT ON COLUMN public.creatives.description_ar IS 'Arabic version of description';
COMMENT ON COLUMN public.creatives.caption_ar IS 'Arabic version of caption';
COMMENT ON COLUMN public.creatives.delivery_deadline IS 'Asset delivery deadline date';
COMMENT ON COLUMN public.creatives.content_pillar IS 'Content pillar or theme category';
COMMENT ON COLUMN public.creatives.campaign_theme IS 'Specific campaign theme or initiative';
COMMENT ON COLUMN public.creatives.specs_link IS 'Link to platform specs documentation';
COMMENT ON COLUMN public.creatives.assets_link IS 'Link to creative assets folder';