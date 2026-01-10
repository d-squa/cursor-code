-- Tighten overly-permissive user_sessions RLS policy (was true)

DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;

CREATE POLICY "Service role can manage sessions"
ON public.user_sessions
FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
