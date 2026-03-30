
-- Fix RLS policies for client_qc_checklists
DROP POLICY "Users can manage their client QC checklists" ON public.client_qc_checklists;

CREATE POLICY "Users can view client QC checklists"
  ON public.client_qc_checklists FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert client QC checklists"
  ON public.client_qc_checklists FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update client QC checklists"
  ON public.client_qc_checklists FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete client QC checklists"
  ON public.client_qc_checklists FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

-- Fix RLS policies for qc_checklist_completions
DROP POLICY "Users can manage QC checklist completions" ON public.qc_checklist_completions;

CREATE POLICY "Users can view QC checklist completions"
  ON public.qc_checklist_completions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.qc_tracking qt
    WHERE qt.id = qc_tracking_id AND (qt.user_id = auth.uid() OR qt.team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    ))
  ));

CREATE POLICY "Users can insert QC checklist completions"
  ON public.qc_checklist_completions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.qc_tracking qt
    WHERE qt.id = qc_tracking_id AND (qt.user_id = auth.uid() OR qt.team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    ))
  ));

CREATE POLICY "Users can update QC checklist completions"
  ON public.qc_checklist_completions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.qc_tracking qt
    WHERE qt.id = qc_tracking_id AND (qt.user_id = auth.uid() OR qt.team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    ))
  ));

CREATE POLICY "Users can delete QC checklist completions"
  ON public.qc_checklist_completions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.qc_tracking qt
    WHERE qt.id = qc_tracking_id AND (qt.user_id = auth.uid() OR qt.team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    ))
  ));
