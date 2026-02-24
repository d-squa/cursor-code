
-- Table to store detected DSP config changes for acknowledgment
CREATE TABLE public.dsp_config_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- campaign, adgroup, ad
  entity_name TEXT, -- DSP entity name
  dsp_entity_id TEXT NOT NULL,
  market TEXT,
  phase_name TEXT,
  change_category TEXT NOT NULL, -- budget, schedule, targeting, creative, status, naming
  field_name TEXT NOT NULL, -- specific field that changed
  field_label TEXT, -- human-readable label
  actiplan_value TEXT, -- what ActiPlan had (JSON stringified)
  dsp_value TEXT, -- what DSP now has (JSON stringified)
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_dsp_config_changes_campaign ON public.dsp_config_changes(campaign_id);
CREATE INDEX idx_dsp_config_changes_unacked ON public.dsp_config_changes(campaign_id, is_acknowledged) WHERE NOT is_acknowledged;

-- RLS policies
ALTER TABLE public.dsp_config_changes ENABLE ROW LEVEL SECURITY;

-- Users can view changes for their own campaigns
CREATE POLICY "Users can view their own campaign config changes"
  ON public.dsp_config_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = dsp_config_changes.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Team members can view changes for team campaigns
CREATE POLICY "Team members can view team campaign config changes"
  ON public.dsp_config_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.user_roles ur ON ur.team_id = c.team_id
      WHERE c.id = dsp_config_changes.campaign_id
      AND ur.user_id = auth.uid()
    )
  );

-- Users can update (acknowledge) changes for their campaigns
CREATE POLICY "Users can acknowledge their own campaign config changes"
  ON public.dsp_config_changes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = dsp_config_changes.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Team members can acknowledge changes for team campaigns
CREATE POLICY "Team members can acknowledge team campaign config changes"
  ON public.dsp_config_changes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.user_roles ur ON ur.team_id = c.team_id
      WHERE c.id = dsp_config_changes.campaign_id
      AND ur.user_id = auth.uid()
      AND ur.role = ANY(ARRAY['owner'::app_role, 'admin'::app_role, 'campaign_manager'::app_role])
    )
  );

-- Service role can manage all (for edge function inserts)
CREATE POLICY "Service role can manage all config changes"
  ON public.dsp_config_changes
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
