-- Add ad_account_id column to meta_pages to scope pages to specific ad accounts
ALTER TABLE public.meta_pages 
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id column to meta_instagram_accounts
ALTER TABLE public.meta_instagram_accounts 
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id column to meta_catalogs
ALTER TABLE public.meta_catalogs 
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id column to meta_product_sets
ALTER TABLE public.meta_product_sets 
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id column to meta_conversion_events
ALTER TABLE public.meta_conversion_events 
ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_meta_pages_ad_account_id ON public.meta_pages(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_instagram_accounts_ad_account_id ON public.meta_instagram_accounts(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_catalogs_ad_account_id ON public.meta_catalogs(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_product_sets_ad_account_id ON public.meta_product_sets(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_ad_account_id ON public.meta_conversion_events(ad_account_id);