
-- Client QC Checklists: stores per-client customized checklist items
CREATE TABLE public.client_qc_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  UNIQUE(client_id, platform, entity_type)
);

ALTER TABLE public.client_qc_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their client QC checklists"
  ON public.client_qc_checklists
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- QC Checklist Completions: tracks which items are checked per entity
CREATE TABLE public.qc_checklist_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_tracking_id UUID REFERENCES public.qc_tracking(id) ON DELETE CASCADE NOT NULL,
  item_key TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID,
  checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(qc_tracking_id, item_key)
);

ALTER TABLE public.qc_checklist_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage QC checklist completions"
  ON public.qc_checklist_completions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at on client_qc_checklists
CREATE TRIGGER update_client_qc_checklists_updated_at
  BEFORE UPDATE ON public.client_qc_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
