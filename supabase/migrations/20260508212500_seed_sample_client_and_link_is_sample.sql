-- Ensure sample mode has a visible D-squad client and bind all sample ad accounts to it.

DO $$
DECLARE
  v_user_id uuid := 'a286c88e-cd14-45af-94df-45ac2eb8d835'::uuid;
  v_team_id uuid := '22d74f6d-437e-4272-80e6-7c06da263434'::uuid;
  v_client_id uuid := 'e3e79318-31cc-413d-a471-a415075274c3'::uuid;
BEGIN
  -- 1) Upsert canonical sample client expected by sample-mode UI filters.
  INSERT INTO public.clients (
    id,
    user_id,
    name,
    industry,
    business_objective,
    website,
    app_name,
    platforms,
    markets,
    qc_enforce_individual
  )
  VALUES (
    v_client_id,
    v_user_id,
    'D-squad',
    'E-commerce',
    'Increase online sales and qualified leads',
    'https://d-squad.example',
    'D-squad App',
    '["meta","google","tiktok"]'::jsonb,
    '["United States","United Kingdom"]'::jsonb,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    name = 'D-squad',
    industry = EXCLUDED.industry,
    business_objective = EXCLUDED.business_objective,
    website = EXCLUDED.website,
    app_name = EXCLUDED.app_name,
    platforms = EXCLUDED.platforms,
    markets = EXCLUDED.markets,
    qc_enforce_individual = EXCLUDED.qc_enforce_individual,
    updated_at = now();

  -- 2) Link sample client to the sample workspace so Clients page can load it.
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_clients tc
    WHERE tc.team_id = v_team_id
      AND tc.client_id = v_client_id
  ) THEN
    INSERT INTO public.team_clients (team_id, client_id)
    VALUES (v_team_id, v_client_id);
  END IF;

  -- 3) Backfill client_id on all sample ad-account rows.
  IF to_regclass('public.meta_ad_accounts') IS NOT NULL THEN
    UPDATE public.meta_ad_accounts
    SET client_id = v_client_id
    WHERE is_sample = true;
  END IF;

  IF to_regclass('public.tiktok_ad_accounts') IS NOT NULL THEN
    UPDATE public.tiktok_ad_accounts
    SET client_id = v_client_id
    WHERE is_sample = true;
  END IF;

  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    UPDATE public.google_ad_accounts
    SET client_id = v_client_id
    WHERE is_sample = true;
  END IF;

  IF to_regclass('public.snapchat_ad_accounts') IS NOT NULL THEN
    UPDATE public.snapchat_ad_accounts
    SET client_id = v_client_id
    WHERE is_sample = true;
  END IF;
END $$;
