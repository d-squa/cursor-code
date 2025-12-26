-- Ensure every authenticated user has a personal workspace + owner role.
-- This avoids relying on triggers on auth schema.

CREATE OR REPLACE FUNCTION public.ensure_user_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid uuid;
  email text;
  existing_team_id uuid;
  base_name text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  email := auth.jwt() ->> 'email';

  -- Ensure profile exists (idempotent)
  INSERT INTO public.profiles (id, email)
  VALUES (uid, COALESCE(email, ''))
  ON CONFLICT (id)
  DO UPDATE SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  -- Ensure at least one owned team exists
  SELECT t.id
  INTO existing_team_id
  FROM public.teams t
  WHERE t.owner_id = uid
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF existing_team_id IS NULL THEN
    base_name := NULLIF(split_part(COALESCE(email, ''), '@', 1), '');

    INSERT INTO public.teams (name, owner_id, description)
    VALUES (
      COALESCE(base_name, 'My') || '''s Workspace',
      uid,
      'Personal workspace'
    )
    RETURNING id INTO existing_team_id;
  END IF;

  -- Ensure owner role exists for that team (idempotent)
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND ur.team_id = existing_team_id
      AND ur.role = 'owner'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role, team_id)
    VALUES (uid, 'owner'::public.app_role, existing_team_id);
  END IF;

  RETURN existing_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_workspace() TO authenticated;