-- Create a function that checks if user is owner (either by role in user_roles or by owning a team)
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.teams WHERE owner_id = _user_id
  )
$$;

-- Drop the old owner policies that use has_role
DROP POLICY IF EXISTS "Owners can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can view all profiles" ON public.profiles;

-- Create new policies using is_owner function
CREATE POLICY "Owners can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (public.is_owner(auth.uid()));

CREATE POLICY "Owners can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.is_owner(auth.uid()));