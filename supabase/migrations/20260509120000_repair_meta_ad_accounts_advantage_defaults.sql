-- Repair drift: PGRST204 on PATCH meta_ad_accounts for default_advantage_plus_* columns
-- when migration 20260320212956 is recorded but ALTER TABLE did not persist.

ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS default_advantage_plus_campaign boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_advantage_plus_audience boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_advantage_plus_creative boolean DEFAULT false;
