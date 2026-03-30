
-- QC State enum
CREATE TYPE public.qc_state AS ENUM ('waiting_for_final_qc', 'qc', 'pushed_live', 'delivering');

-- QC tracking table for campaigns, ad sets, and ads across all platforms
CREATE TABLE public.qc_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  market TEXT,
  phase_name TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  entity_name TEXT,
  dsp_entity_id TEXT,
  current_state public.qc_state NOT NULL DEFAULT 'waiting_for_final_qc',
  previous_state public.qc_state,
  qc_parameter_raw TEXT,
  impressions_count BIGINT DEFAULT 0,
  auto_completed BOOLEAN DEFAULT false,
  auto_completed_at TIMESTAMPTZ,
  qc_removed_from_dsp BOOLEAN DEFAULT false,
  qc_removed_at TIMESTAMPTZ,
  validation_error TEXT,
  is_valid BOOLEAN DEFAULT true,
  state_history JSONB DEFAULT '[]'::jsonb,
  team_id UUID REFERENCES public.teams(id),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, platform, dsp_entity_id, entity_type)
);

-- QC state transitions log for time tracking
CREATE TABLE public.qc_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_tracking_id UUID REFERENCES public.qc_tracking(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  from_state public.qc_state,
  to_state public.qc_state NOT NULL,
  transitioned_at TIMESTAMPTZ DEFAULT now(),
  detected_via TEXT DEFAULT 'sync' CHECK (detected_via IN ('sync', 'cron', 'manual')),
  impressions_at_transition BIGINT DEFAULT 0,
  metadata JSONB
);

-- Enable RLS
ALTER TABLE public.qc_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_state_transitions ENABLE ROW LEVEL SECURITY;

-- RLS policies for qc_tracking
CREATE POLICY "Users can view own QC tracking" ON public.qc_tracking
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own QC tracking" ON public.qc_tracking
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own QC tracking" ON public.qc_tracking
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own QC tracking" ON public.qc_tracking
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS policies for qc_state_transitions
CREATE POLICY "Users can view own QC transitions" ON public.qc_state_transitions
  FOR SELECT TO authenticated
  USING (campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid() OR team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert QC transitions" ON public.qc_state_transitions
  FOR INSERT TO authenticated
  WITH CHECK (campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid() OR team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  ));

-- Updated_at trigger
CREATE TRIGGER update_qc_tracking_updated_at
  BEFORE UPDATE ON public.qc_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for QC tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_tracking;

-- Index for performance
CREATE INDEX idx_qc_tracking_campaign ON public.qc_tracking(campaign_id);
CREATE INDEX idx_qc_tracking_state ON public.qc_tracking(current_state);
CREATE INDEX idx_qc_transitions_tracking ON public.qc_state_transitions(qc_tracking_id);
CREATE INDEX idx_qc_transitions_campaign ON public.qc_state_transitions(campaign_id);
