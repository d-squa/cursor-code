CREATE TABLE IF NOT EXISTS public.google_conversion_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id text NOT NULL,
  conversion_action_id text NOT NULL,
  conversion_action_name text NOT NULL,
  conversion_type text,
  category text,
  status text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, customer_id, conversion_action_id)
);

ALTER TABLE public.google_conversion_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversion actions"
  ON public.google_conversion_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversion actions"
  ON public.google_conversion_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversion actions"
  ON public.google_conversion_actions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);