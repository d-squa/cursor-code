-- Ensure Platform & Market Selection has connected platform types in sample mode
-- for the extend campaign context.

ALTER TABLE public.connected_platforms
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.connected_platforms
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  v_campaign_id uuid := 'be16e9ac-5eea-4663-8bd3-9d91dc7f17fd'::uuid;
  v_user_id uuid;
  v_team_id uuid;

  v_meta_account_id text;
  v_meta_account_name text;
  v_google_account_id text;
  v_google_account_name text;
  v_tiktok_account_id text;
  v_tiktok_account_name text;
BEGIN
  -- Resolve owner/team from the target campaign first.
  SELECT c.user_id, c.team_id
  INTO v_user_id, v_team_id
  FROM public.campaigns c
  WHERE c.id = v_campaign_id;

  -- Fallback to known sample scope if campaign lookup fails.
  IF v_user_id IS NULL THEN
    v_user_id := 'a286c88e-cd14-45af-94df-45ac2eb8d835'::uuid;
  END IF;
  IF v_team_id IS NULL THEN
    v_team_id := '22d74f6d-437e-4272-80e6-7c06da263434'::uuid;
  END IF;

  -- Pick representative sample ad accounts where available.
  SELECT m.account_id, COALESCE(m.account_name, 'Sample Meta Account')
  INTO v_meta_account_id, v_meta_account_name
  FROM public.meta_ad_accounts m
  WHERE m.is_sample = true
    AND m.user_id = v_user_id
  ORDER BY m.synced_at DESC NULLS LAST, m.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT g.account_id, COALESCE(g.account_name, 'Sample Google Ads Account')
  INTO v_google_account_id, v_google_account_name
  FROM public.google_ad_accounts g
  WHERE g.is_sample = true
    AND g.user_id = v_user_id
  ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT t.account_id, COALESCE(t.account_name, 'Sample TikTok Account')
  INTO v_tiktok_account_id, v_tiktok_account_name
  FROM public.tiktok_ad_accounts t
  WHERE t.is_sample = true
    AND t.user_id = v_user_id
  ORDER BY t.synced_at DESC NULLS LAST, t.created_at DESC NULLS LAST
  LIMIT 1;

  -- Last-resort placeholders if source tables are empty.
  v_meta_account_id := COALESCE(v_meta_account_id, 'sample_meta_123456');
  v_google_account_id := COALESCE(v_google_account_id, 'sample_google_123456');
  v_tiktok_account_id := COALESCE(v_tiktok_account_id, 'sample_tiktok_123456');
  v_meta_account_name := COALESCE(v_meta_account_name, 'Sample Meta Account');
  v_google_account_name := COALESCE(v_google_account_name, 'Sample Google Ads Account');
  v_tiktok_account_name := COALESCE(v_tiktok_account_name, 'Sample TikTok Account');

  -- Meta connection
  IF NOT EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.user_id = v_user_id
      AND cp.team_id IS NOT DISTINCT FROM v_team_id
      AND cp.platform_type = 'meta'
      AND cp.ad_account_id = v_meta_account_id
  ) THEN
    INSERT INTO public.connected_platforms (
      user_id,
      team_id,
      platform_type,
      platform_name,
      ad_account_id,
      ad_account_name,
      is_active,
      is_sample,
      metadata
    )
    VALUES (
      v_user_id,
      v_team_id,
      'meta',
      'Meta',
      v_meta_account_id,
      v_meta_account_name,
      true,
      true,
      '{}'::jsonb
    );
  END IF;

  -- Google connection (must be exactly "google" for Platform & Market selector)
  IF NOT EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.user_id = v_user_id
      AND cp.team_id IS NOT DISTINCT FROM v_team_id
      AND cp.platform_type = 'google'
      AND cp.ad_account_id = v_google_account_id
  ) THEN
    INSERT INTO public.connected_platforms (
      user_id,
      team_id,
      platform_type,
      platform_name,
      ad_account_id,
      ad_account_name,
      is_active,
      is_sample,
      metadata
    )
    VALUES (
      v_user_id,
      v_team_id,
      'google',
      'Google Ads',
      v_google_account_id,
      v_google_account_name,
      true,
      true,
      '{}'::jsonb
    );
  END IF;

  -- TikTok connection
  IF NOT EXISTS (
    SELECT 1
    FROM public.connected_platforms cp
    WHERE cp.user_id = v_user_id
      AND cp.team_id IS NOT DISTINCT FROM v_team_id
      AND cp.platform_type = 'tiktok'
      AND cp.ad_account_id = v_tiktok_account_id
  ) THEN
    INSERT INTO public.connected_platforms (
      user_id,
      team_id,
      platform_type,
      platform_name,
      ad_account_id,
      ad_account_name,
      is_active,
      is_sample,
      metadata
    )
    VALUES (
      v_user_id,
      v_team_id,
      'tiktok',
      'TikTok',
      v_tiktok_account_id,
      v_tiktok_account_name,
      true,
      true,
      '{}'::jsonb
    );
  END IF;
END $$;
