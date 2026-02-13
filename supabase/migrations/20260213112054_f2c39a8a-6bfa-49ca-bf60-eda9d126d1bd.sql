
-- Table for admin-managed subscription overrides (test users, demos, etc.)
CREATE TABLE public.subscription_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'freelancer', 'enterprise', 'agency')),
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_overrides ENABLE ROW LEVEL SECURITY;

-- Only service role can manage overrides (used by edge functions)
CREATE POLICY "Service role can manage overrides"
ON public.subscription_overrides
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Users can view their own override (so check-subscription can work with user token too)
CREATE POLICY "Users can view their own override"
ON public.subscription_overrides
FOR SELECT
USING (auth.uid() = user_id);
