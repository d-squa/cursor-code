-- Create a security definer function to check if user is an owner
-- This bypasses RLS to prevent recursive policy issues
CREATE OR REPLACE FUNCTION public.is_team_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  )
$$;

-- Also add a policy to allow users to view their own team (as owner)
-- This ensures the useRole hook can check team ownership
DROP POLICY IF EXISTS "Users can view teams they own" ON public.teams;
CREATE POLICY "Users can view teams they own"
ON public.teams
FOR SELECT
USING (owner_id = auth.uid());