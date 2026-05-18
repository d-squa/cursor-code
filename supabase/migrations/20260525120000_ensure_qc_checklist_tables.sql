-- qc_checklist_completions / client_qc_checklists from 20260330172351 may be missing on hosted DBs.
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS public.client_qc_checklists (
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

CREATE TABLE IF NOT EXISTS public.qc_checklist_completions (
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

ALTER TABLE public.qc_checklist_completions
  ADD COLUMN IF NOT EXISTS check_method TEXT NOT NULL DEFAULT 'individual';

CREATE INDEX IF NOT EXISTS idx_qc_checklist_completions_tracking
  ON public.qc_checklist_completions(qc_tracking_id);

CREATE INDEX IF NOT EXISTS idx_client_qc_checklists_client
  ON public.client_qc_checklists(client_id);

ALTER TABLE public.client_qc_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_checklist_completions ENABLE ROW LEVEL SECURITY;

-- client_qc_checklists policies (20260330172407)
DROP POLICY IF EXISTS "Users can manage their client QC checklists" ON public.client_qc_checklists;
DROP POLICY IF EXISTS "Users can view client QC checklists" ON public.client_qc_checklists;
DROP POLICY IF EXISTS "Users can insert client QC checklists" ON public.client_qc_checklists;
DROP POLICY IF EXISTS "Users can update client QC checklists" ON public.client_qc_checklists;
DROP POLICY IF EXISTS "Users can delete client QC checklists" ON public.client_qc_checklists;

CREATE POLICY "Users can view client QC checklists"
  ON public.client_qc_checklists FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert client QC checklists"
  ON public.client_qc_checklists FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update client QC checklists"
  ON public.client_qc_checklists FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete client QC checklists"
  ON public.client_qc_checklists FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- qc_checklist_completions policies (20260330172407)
DROP POLICY IF EXISTS "Users can manage QC checklist completions" ON public.qc_checklist_completions;
DROP POLICY IF EXISTS "Users can view QC checklist completions" ON public.qc_checklist_completions;
DROP POLICY IF EXISTS "Users can insert QC checklist completions" ON public.qc_checklist_completions;
DROP POLICY IF EXISTS "Users can update QC checklist completions" ON public.qc_checklist_completions;
DROP POLICY IF EXISTS "Users can delete QC checklist completions" ON public.qc_checklist_completions;

CREATE POLICY "Users can view QC checklist completions"
  ON public.qc_checklist_completions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qc_tracking qt
      WHERE qt.id = qc_tracking_id
        AND (
          qt.user_id = auth.uid()
          OR qt.team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can insert QC checklist completions"
  ON public.qc_checklist_completions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qc_tracking qt
      WHERE qt.id = qc_tracking_id
        AND (
          qt.user_id = auth.uid()
          OR qt.team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can update QC checklist completions"
  ON public.qc_checklist_completions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qc_tracking qt
      WHERE qt.id = qc_tracking_id
        AND (
          qt.user_id = auth.uid()
          OR qt.team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can delete QC checklist completions"
  ON public.qc_checklist_completions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qc_tracking qt
      WHERE qt.id = qc_tracking_id
        AND (
          qt.user_id = auth.uid()
          OR qt.team_id IN (SELECT team_id FROM public.user_roles WHERE user_id = auth.uid())
        )
    )
  );

DROP TRIGGER IF EXISTS update_client_qc_checklists_updated_at ON public.client_qc_checklists;
CREATE TRIGGER update_client_qc_checklists_updated_at
  BEFORE UPDATE ON public.client_qc_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
