-- Add policy for owners to view all user_roles
CREATE POLICY "Owners can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'owner'::app_role));

-- Add policy for owners to view all profiles
CREATE POLICY "Owners can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'owner'::app_role));