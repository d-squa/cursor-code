
-- Allow admins/owners to manage subscription overrides
CREATE POLICY "Admins can manage overrides"
ON public.subscription_overrides
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
