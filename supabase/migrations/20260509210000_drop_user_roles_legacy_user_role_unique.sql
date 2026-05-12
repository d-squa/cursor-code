-- Repair 23505 / 409: legacy UNIQUE(user_id, role) blocks the same role across teams
-- (e.g. owner on personal workspace + owner on a new team). Correct uniqueness is per team.
-- See 20251223082135 — ensure applied when migration history drifted.

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    INNER JOIN pg_class rel ON rel.oid = c.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'user_roles'
      AND c.conname = 'user_roles_user_team_unique'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_team_unique UNIQUE (user_id, team_id);
  END IF;
END $$;
