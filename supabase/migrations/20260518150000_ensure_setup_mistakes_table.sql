-- setup_mistakes was added in 20260425231211 but may be missing on hosted DBs when db push failed.
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS public.setup_mistakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  qc_tracking_id UUID REFERENCES public.qc_tracking(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  platform TEXT,
  market TEXT,
  phase_name TEXT,
  ad_set_name TEXT,
  ad_name TEXT,
  entity_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT setup_mistakes_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_setup_mistakes_campaign ON public.setup_mistakes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_setup_mistakes_qc_tracking ON public.setup_mistakes(qc_tracking_id);
CREATE INDEX IF NOT EXISTS idx_setup_mistakes_team ON public.setup_mistakes(team_id);
CREATE INDEX IF NOT EXISTS idx_setup_mistakes_status ON public.setup_mistakes(status);
CREATE INDEX IF NOT EXISTS idx_setup_mistakes_created_by ON public.setup_mistakes(created_by);

ALTER TABLE public.setup_mistakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view setup mistakes" ON public.setup_mistakes;
CREATE POLICY "Team members can view setup mistakes"
ON public.setup_mistakes
FOR SELECT
TO authenticated
USING (
  team_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.team_id = setup_mistakes.team_id
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = setup_mistakes.team_id AND t.owner_id = auth.uid()
  )
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Team members can create setup mistakes" ON public.setup_mistakes;
CREATE POLICY "Team members can create setup mistakes"
ON public.setup_mistakes
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    team_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.team_id = setup_mistakes.team_id
    )
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = setup_mistakes.team_id AND t.owner_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Team members can update setup mistakes" ON public.setup_mistakes;
CREATE POLICY "Team members can update setup mistakes"
ON public.setup_mistakes
FOR UPDATE
TO authenticated
USING (
  team_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.team_id = setup_mistakes.team_id
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = setup_mistakes.team_id AND t.owner_id = auth.uid()
  )
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Owners and creators can delete setup mistakes" ON public.setup_mistakes;
CREATE POLICY "Owners and creators can delete setup mistakes"
ON public.setup_mistakes
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = setup_mistakes.team_id AND t.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.team_id = setup_mistakes.team_id
      AND ur.role IN ('owner'::public.app_role, 'admin'::public.app_role)
  )
);

DROP TRIGGER IF EXISTS trg_setup_mistakes_updated_at ON public.setup_mistakes;
CREATE TRIGGER trg_setup_mistakes_updated_at
BEFORE UPDATE ON public.setup_mistakes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_mistakes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_mistakes TO service_role;

NOTIFY pgrst, 'reload schema';
