-- Drop the incorrect unique constraint that limits one role per user globally
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add correct unique constraint: one role per user per team
-- (user_roles_user_team_unique already exists, so we're good)

-- Now insert the owner role for Team A
INSERT INTO public.user_roles (user_id, role, team_id)
VALUES ('27da368b-05af-4fc4-b187-fb3b788ea405', 'owner', '87f30725-33b4-47e8-a237-d6f9b9597735')
ON CONFLICT (user_id, team_id) DO UPDATE SET role = 'owner';