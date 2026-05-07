CREATE TABLE IF NOT EXISTS public.subscription_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tier text NOT NULL CHECK (tier IN ('basic', 'freelancer', 'enterprise', 'agency')),
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_overrides'
      AND policyname = 'Service role can manage overrides'
  ) THEN
    CREATE POLICY "Service role can manage overrides"
    ON public.subscription_overrides
    FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role')
    WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_overrides'
      AND policyname = 'Users can view their own override'
  ) THEN
    CREATE POLICY "Users can view their own override"
    ON public.subscription_overrides
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;
