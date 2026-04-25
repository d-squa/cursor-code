-- Performance Max shared-pool asset group model
CREATE TABLE IF NOT EXISTS public.pmax_asset_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  market TEXT NOT NULL,
  phase_name TEXT NOT NULL,
  ad_group_name TEXT NOT NULL,
  group_name TEXT,
  business_name TEXT,
  final_url TEXT,
  call_to_action TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  dsp_entity_id TEXT,
  error_message TEXT,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, market, phase_name, ad_group_name)
);

CREATE INDEX IF NOT EXISTS idx_pmax_asset_groups_campaign ON public.pmax_asset_groups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pmax_asset_groups_team ON public.pmax_asset_groups(team_id);

CREATE TABLE IF NOT EXISTS public.pmax_text_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_group_id UUID NOT NULL REFERENCES public.pmax_asset_groups(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('headline','long_headline','description')),
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pmax_text_assets_group ON public.pmax_text_assets(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_pmax_text_assets_group_type ON public.pmax_text_assets(asset_group_id, asset_type);

CREATE TABLE IF NOT EXISTS public.pmax_creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_group_id UUID NOT NULL REFERENCES public.pmax_asset_groups(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES public.creative_library_assets(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('marketing_image','square_image','portrait_image','logo','video')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_group_id, creative_id, bucket)
);
CREATE INDEX IF NOT EXISTS idx_pmax_creative_assets_group ON public.pmax_creative_assets(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_pmax_creative_assets_group_bucket ON public.pmax_creative_assets(asset_group_id, bucket);

ALTER TABLE public.pmax_asset_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmax_text_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmax_creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view PMax asset groups"
  ON public.pmax_asset_groups FOR SELECT
  USING (
    (team_id IS NULL AND user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
    OR team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
  );

CREATE POLICY "Team members can insert PMax asset groups"
  ON public.pmax_asset_groups FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
      OR team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Team members can update PMax asset groups"
  ON public.pmax_asset_groups FOR UPDATE
  USING (
    (team_id IS NULL AND user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
    OR team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
  );

CREATE POLICY "Team members can delete PMax asset groups"
  ON public.pmax_asset_groups FOR DELETE
  USING (
    (team_id IS NULL AND user_id = auth.uid())
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
    OR team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
  );

CREATE POLICY "Team members can view PMax text assets"
  ON public.pmax_text_assets FOR SELECT
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can insert PMax text assets"
  ON public.pmax_text_assets FOR INSERT
  WITH CHECK (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can update PMax text assets"
  ON public.pmax_text_assets FOR UPDATE
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can delete PMax text assets"
  ON public.pmax_text_assets FOR DELETE
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can view PMax creative assets"
  ON public.pmax_creative_assets FOR SELECT
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can insert PMax creative assets"
  ON public.pmax_creative_assets FOR INSERT
  WITH CHECK (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can update PMax creative assets"
  ON public.pmax_creative_assets FOR UPDATE
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE POLICY "Team members can delete PMax creative assets"
  ON public.pmax_creative_assets FOR DELETE
  USING (asset_group_id IN (SELECT id FROM public.pmax_asset_groups));

CREATE TRIGGER update_pmax_asset_groups_updated_at
  BEFORE UPDATE ON public.pmax_asset_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  rec RECORD;
  v_group_id UUID;
  v_team_id UUID;
  v_user_id UUID;
BEGIN
  FOR rec IN
    SELECT
      ca.campaign_id,
      ca.market,
      ca.phase_name,
      ca.ad_set_name AS ad_group_name,
      bool_or(COALESCE(ca.is_sample,false)) AS is_sample,
      (array_agg(ca.business_name) FILTER (WHERE ca.business_name IS NOT NULL AND ca.business_name <> ''))[1] AS business_name,
      (array_agg(ca.brand_name) FILTER (WHERE ca.brand_name IS NOT NULL AND ca.brand_name <> ''))[1] AS brand_name,
      (array_agg(ca.destination_url) FILTER (WHERE ca.destination_url IS NOT NULL AND ca.destination_url <> ''))[1] AS final_url,
      (array_agg(ca.call_to_action) FILTER (WHERE ca.call_to_action IS NOT NULL AND ca.call_to_action <> ''))[1] AS call_to_action
    FROM public.creative_assignments ca
    WHERE LOWER(COALESCE(ca.platform,'')) = 'google'
      AND (LOWER(COALESCE(ca.phase_name,'')) LIKE '%pmax%'
           OR LOWER(COALESCE(ca.phase_name,'')) LIKE '%performance%'
           OR LOWER(COALESCE(ca.phase_name,'')) LIKE '%p-max%')
    GROUP BY ca.campaign_id, ca.market, ca.phase_name, ca.ad_set_name
  LOOP
    SELECT team_id, user_id INTO v_team_id, v_user_id
    FROM public.campaigns WHERE id = rec.campaign_id;

    IF v_user_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.pmax_asset_groups (
      campaign_id, market, phase_name, ad_group_name,
      team_id, user_id, is_sample,
      business_name, final_url, call_to_action,
      group_name, status
    ) VALUES (
      rec.campaign_id, rec.market, rec.phase_name, rec.ad_group_name,
      v_team_id, v_user_id, COALESCE(rec.is_sample, false),
      COALESCE(rec.business_name, rec.brand_name),
      rec.final_url, rec.call_to_action,
      rec.ad_group_name, 'pending'
    )
    ON CONFLICT (campaign_id, market, phase_name, ad_group_name) DO NOTHING
    RETURNING id INTO v_group_id;

    IF v_group_id IS NULL THEN
      SELECT id INTO v_group_id FROM public.pmax_asset_groups
      WHERE campaign_id = rec.campaign_id
        AND market = rec.market
        AND phase_name = rec.phase_name
        AND ad_group_name = rec.ad_group_name;
    END IF;

    INSERT INTO public.pmax_text_assets (asset_group_id, asset_type, content, position)
    SELECT v_group_id, 'headline', val, (row_number() OVER ())::int - 1
    FROM (
      SELECT DISTINCT TRIM(val) AS val
      FROM public.creative_assignments ca,
           LATERAL unnest(ARRAY[ca.headline, ca.headline_2, ca.headline_3, ca.headline_4, ca.headline_5]) AS val
      WHERE ca.campaign_id = rec.campaign_id
        AND ca.market = rec.market
        AND ca.phase_name = rec.phase_name
        AND ca.ad_set_name = rec.ad_group_name
        AND val IS NOT NULL AND TRIM(val) <> ''
    ) hl;

    INSERT INTO public.pmax_text_assets (asset_group_id, asset_type, content, position)
    SELECT v_group_id, 'long_headline', val, (row_number() OVER ())::int - 1
    FROM (
      SELECT DISTINCT TRIM(val) AS val
      FROM public.creative_assignments ca,
           LATERAL unnest(ARRAY[ca.long_headline_1, ca.long_headline_2, ca.long_headline_3, ca.long_headline_4, ca.long_headline_5]) AS val
      WHERE ca.campaign_id = rec.campaign_id
        AND ca.market = rec.market
        AND ca.phase_name = rec.phase_name
        AND ca.ad_set_name = rec.ad_group_name
        AND val IS NOT NULL AND TRIM(val) <> ''
    ) lh;

    INSERT INTO public.pmax_text_assets (asset_group_id, asset_type, content, position)
    SELECT v_group_id, 'description', val, (row_number() OVER ())::int - 1
    FROM (
      SELECT DISTINCT TRIM(val) AS val
      FROM public.creative_assignments ca,
           LATERAL unnest(ARRAY[ca.description, ca.description_2, ca.description_3, ca.description_4, ca.description_5]) AS val
      WHERE ca.campaign_id = rec.campaign_id
        AND ca.market = rec.market
        AND ca.phase_name = rec.phase_name
        AND ca.ad_set_name = rec.ad_group_name
        AND val IS NOT NULL AND TRIM(val) <> ''
    ) d;

    INSERT INTO public.pmax_creative_assets (asset_group_id, creative_id, bucket, position)
    SELECT DISTINCT v_group_id, ca.creative_id,
      CASE WHEN cla.asset_type = 'video' THEN 'video' ELSE 'marketing_image' END,
      0
    FROM public.creative_assignments ca
    JOIN public.creative_library_assets cla ON cla.id = ca.creative_id
    WHERE ca.campaign_id = rec.campaign_id
      AND ca.market = rec.market
      AND ca.phase_name = rec.phase_name
      AND ca.ad_set_name = rec.ad_group_name
    ON CONFLICT (asset_group_id, creative_id, bucket) DO NOTHING;
  END LOOP;
END $$;