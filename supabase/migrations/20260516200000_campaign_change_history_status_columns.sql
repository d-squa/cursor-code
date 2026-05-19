-- Track approval / lifecycle status transitions in change history (View History UI).
ALTER TABLE public.campaign_change_history
  ADD COLUMN IF NOT EXISTS old_status text,
  ADD COLUMN IF NOT EXISTS new_status text;
