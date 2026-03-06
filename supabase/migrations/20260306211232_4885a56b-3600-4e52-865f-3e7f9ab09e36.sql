
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country text;

-- Update handle_new_user to store first_name, last_name, phone from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_team_id uuid;
  raw_meta jsonb;
BEGIN
  raw_meta := COALESCE(new.raw_user_meta_data, '{}'::jsonb);

  -- Create profile
  INSERT INTO public.profiles (id, email, first_name, last_name, phone, company_name, full_name)
  VALUES (
    new.id,
    new.email,
    raw_meta->>'first_name',
    raw_meta->>'last_name',
    raw_meta->>'phone',
    raw_meta->>'company_name',
    NULLIF(TRIM(COALESCE(raw_meta->>'first_name', '') || ' ' || COALESCE(raw_meta->>'last_name', '')), '')
  );
  
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
$function$;
