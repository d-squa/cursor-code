-- Apply a single workspace team_id to all seeded platform ad-account rows.
-- This targets rows tied to the seed user.

DO $$
DECLARE
  v_user_id uuid := 'a286c88e-cd14-45af-94df-45ac2eb8d835'::uuid;
  v_team_id uuid := '22d74f6d-437e-4272-80e6-7c06da263434'::uuid;
BEGIN
  UPDATE public.tiktok_ad_accounts
  SET team_id = v_team_id
  WHERE user_id = v_user_id;

  UPDATE public.meta_ad_accounts
  SET team_id = v_team_id
  WHERE user_id = v_user_id;

  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    UPDATE public.google_ad_accounts
    SET team_id = v_team_id
    WHERE user_id = v_user_id;
  END IF;
END $$;
