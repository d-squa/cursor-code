ALTER TABLE public.google_ad_accounts 
  ADD COLUMN IF NOT EXISTS default_brand_guidelines boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_business_name text;