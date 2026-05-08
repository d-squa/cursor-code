-- Keep sample rows consistent: auto-apply canonical sample client_id
-- whenever is_sample = true on tables that store client_id.

CREATE OR REPLACE FUNCTION public.apply_sample_client_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_sample = true THEN
    NEW.client_id := 'e3e79318-31cc-413d-a471-a415075274c3'::uuid;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.meta_ad_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_apply_sample_client_id_meta_ad_accounts ON public.meta_ad_accounts;
    CREATE TRIGGER trg_apply_sample_client_id_meta_ad_accounts
    BEFORE INSERT OR UPDATE ON public.meta_ad_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_sample_client_id();
  END IF;

  IF to_regclass('public.tiktok_ad_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_apply_sample_client_id_tiktok_ad_accounts ON public.tiktok_ad_accounts;
    CREATE TRIGGER trg_apply_sample_client_id_tiktok_ad_accounts
    BEFORE INSERT OR UPDATE ON public.tiktok_ad_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_sample_client_id();
  END IF;

  IF to_regclass('public.google_ad_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_apply_sample_client_id_google_ad_accounts ON public.google_ad_accounts;
    CREATE TRIGGER trg_apply_sample_client_id_google_ad_accounts
    BEFORE INSERT OR UPDATE ON public.google_ad_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_sample_client_id();
  END IF;

  IF to_regclass('public.snapchat_ad_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_apply_sample_client_id_snapchat_ad_accounts ON public.snapchat_ad_accounts;
    CREATE TRIGGER trg_apply_sample_client_id_snapchat_ad_accounts
    BEFORE INSERT OR UPDATE ON public.snapchat_ad_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_sample_client_id();
  END IF;
END $$;
