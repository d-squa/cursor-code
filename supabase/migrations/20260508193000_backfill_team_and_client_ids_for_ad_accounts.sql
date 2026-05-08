-- Backfill team/client ownership across seeded ad account tables.
-- Requested values:
-- team_id  = 22d74f6d-437e-4272-80e6-7c06da263434
-- client_id = e3e79318-31cc-413d-a471-a415075274c3

DO $$
BEGIN
  -- Meta
  IF to_regclass('public.meta_ad_accounts') IS NOT NULL THEN
    UPDATE public.meta_ad_accounts
    SET
      team_id = '22d74f6d-437e-4272-80e6-7c06da263434'::uuid,
      client_id = 'e3e79318-31cc-413d-a471-a415075274c3'::uuid;
  END IF;

  -- TikTok
  IF to_regclass('public.tiktok_ad_accounts') IS NOT NULL THEN
    UPDATE public.tiktok_ad_accounts
    SET
      team_id = '22d74f6d-437e-4272-80e6-7c06da263434'::uuid,
      client_id = 'e3e79318-31cc-413d-a471-a415075274c3'::uuid;
  END IF;

  -- Google
  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    UPDATE public.google_ad_accounts
    SET
      team_id = '22d74f6d-437e-4272-80e6-7c06da263434'::uuid,
      client_id = 'e3e79318-31cc-413d-a471-a415075274c3'::uuid;
  END IF;
END $$;
