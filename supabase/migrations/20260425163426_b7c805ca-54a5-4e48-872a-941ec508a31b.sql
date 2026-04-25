ALTER TABLE public.pmax_creative_assets
  DROP CONSTRAINT IF EXISTS pmax_creative_assets_creative_id_fkey;

ALTER TABLE public.pmax_creative_assets
  ADD CONSTRAINT pmax_creative_assets_creative_id_fkey
  FOREIGN KEY (creative_id) REFERENCES public.creatives(id) ON DELETE CASCADE;