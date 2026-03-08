-- Re-attach the handle_new_user trigger to auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing auth users
INSERT INTO public.profiles (id, email)
SELECT au.id, au.email
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Backfill missing teams for users without any owned team
DO $$
DECLARE
  r RECORD;
  new_team_id uuid;
BEGIN
  FOR r IN
    SELECT au.id AS user_id, au.email
    FROM auth.users au
    LEFT JOIN public.teams t ON t.owner_id = au.id
    WHERE t.id IS NULL
  LOOP
    INSERT INTO public.teams (name, owner_id, description)
    VALUES (
      COALESCE(split_part(r.email, '@', 1), 'My') || '''s Workspace',
      r.user_id,
      'Personal workspace'
    )
    RETURNING id INTO new_team_id;

    INSERT INTO public.user_roles (user_id, role, team_id)
    VALUES (r.user_id, 'owner', new_team_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;