-- dsp_config_changes was added in 20260224204108 but may be missing on hosted DBs when db push failed.
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS public.dsp_config_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_name TEXT,
  dsp_entity_id TEXT NOT NULL,
  market TEXT,
  phase_name TEXT,
  change_category TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_label TEXT,
  actiplan_value TEXT,
  dsp_value TEXT,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsp_config_changes_campaign ON public.dsp_config_changes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dsp_config_changes_unacked
  ON public.dsp_config_changes(campaign_id, is_acknowledged)
  WHERE NOT is_acknowledged;

ALTER TABLE public.dsp_config_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own campaign config changes" ON public.dsp_config_changes;
CREATE POLICY "Users can view their own campaign config changes"
  ON public.dsp_config_changes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = dsp_config_changes.campaign_id
        AND campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can view team campaign config changes" ON public.dsp_config_changes;
CREATE POLICY "Team members can view team campaign config changes"
  ON public.dsp_config_changes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.user_roles ur ON ur.team_id = c.team_id
      WHERE c.id = dsp_config_changes.campaign_id
        AND ur.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can acknowledge their own campaign config changes" ON public.dsp_config_changes;
CREATE POLICY "Users can acknowledge their own campaign config changes"
  ON public.dsp_config_changes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = dsp_config_changes.campaign_id
        AND campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can acknowledge team campaign config changes" ON public.dsp_config_changes;
CREATE POLICY "Team members can acknowledge team campaign config changes"
  ON public.dsp_config_changes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.user_roles ur ON ur.team_id = c.team_id
      WHERE c.id = dsp_config_changes.campaign_id
        AND ur.user_id = auth.uid()
        AND ur.role = ANY(ARRAY['owner'::public.app_role, 'admin'::public.app_role, 'campaign_manager'::public.app_role])
    )
  );

DROP POLICY IF EXISTS "Service role can manage all config changes" ON public.dsp_config_changes;
CREATE POLICY "Service role can manage all config changes"
  ON public.dsp_config_changes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, UPDATE ON public.dsp_config_changes TO authenticated;
GRANT ALL ON public.dsp_config_changes TO service_role;

NOTIFY pgrst, 'reload schema';
