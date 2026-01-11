-- Remove overly permissive RLS policy (service role bypasses RLS automatically)
DROP POLICY IF EXISTS "Service role full access to push jobs" ON public.creative_push_jobs;