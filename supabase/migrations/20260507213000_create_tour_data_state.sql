CREATE TABLE IF NOT EXISTS public.tour_data_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_seeded boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  seeded_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  seeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_data_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tour_data_state' AND policyname = 'Users can view their own tour state'
  ) THEN
    CREATE POLICY "Users can view their own tour state"
      ON public.tour_data_state FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tour_data_state' AND policyname = 'Users can insert their own tour state'
  ) THEN
    CREATE POLICY "Users can insert their own tour state"
      ON public.tour_data_state FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tour_data_state' AND policyname = 'Users can update their own tour state'
  ) THEN
    CREATE POLICY "Users can update their own tour state"
      ON public.tour_data_state FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_tour_data_state_updated_at'
  ) THEN
    CREATE TRIGGER update_tour_data_state_updated_at
      BEFORE UPDATE ON public.tour_data_state
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
