
-- 1. Update handle_new_user to create a personal team for every new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_team_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  
  -- Create a personal team/workspace for this user
  INSERT INTO public.teams (name, owner_id, description)
  VALUES (
    COALESCE(split_part(new.email, '@', 1), 'My Workspace') || '''s Workspace',
    new.id,
    'Personal workspace'
  )
  RETURNING id INTO new_team_id;
  
  -- Assign owner role with team_id
  INSERT INTO public.user_roles (user_id, role, team_id)
  VALUES (new.id, 'owner', new_team_id);
  
  RETURN new;
END;
$$;

-- 2. Update is_owner to be team-scoped (user is owner if they have owner role OR own a team)
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.teams WHERE owner_id = _user_id
  )
$$;

-- 3. Drop old overly-permissive policies on profiles
DROP POLICY IF EXISTS "Owners can view all profiles" ON public.profiles;

-- 4. Drop old overly-permissive policies on user_roles  
DROP POLICY IF EXISTS "Owners can view all roles" ON public.user_roles;

-- 5. Create new team-scoped policy for profiles: owners/admins see only their team members
CREATE POLICY "Team owners can view team member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur_viewer
    JOIN public.user_roles ur_target ON ur_viewer.team_id = ur_target.team_id
    WHERE ur_viewer.user_id = auth.uid()
      AND ur_viewer.role IN ('owner', 'admin')
      AND ur_target.user_id = profiles.id
  )
);

-- 6. Create new team-scoped policy for user_roles: owners see only their team's roles
CREATE POLICY "Team owners can view team roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur_viewer
    WHERE ur_viewer.user_id = auth.uid()
      AND ur_viewer.team_id = user_roles.team_id
      AND ur_viewer.role IN ('owner', 'admin')
  )
);
