-- Create a security definer function to get user's role
-- This bypasses RLS to prevent recursive policy issues
CREATE OR REPLACE FUNCTION public.get_user_highest_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY 
    CASE role 
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'campaign_manager' THEN 3
      WHEN 'collaborator' THEN 4
      WHEN 'member' THEN 5
      WHEN 'viewer' THEN 6
      ELSE 7
    END
  LIMIT 1
$$;