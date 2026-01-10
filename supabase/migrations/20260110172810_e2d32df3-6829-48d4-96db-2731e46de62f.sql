-- Tighten overly-permissive billing_customers RLS policies (were using true)

DROP POLICY IF EXISTS "Service can insert billing customers" ON public.billing_customers;
DROP POLICY IF EXISTS "Service can update billing customers" ON public.billing_customers;

-- Allow only service-role JWTs to write billing customer mappings
CREATE POLICY "Service role can insert billing customers"
ON public.billing_customers
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role can update billing customers"
ON public.billing_customers
FOR UPDATE
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
