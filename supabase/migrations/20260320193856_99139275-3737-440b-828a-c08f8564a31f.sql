
-- Add platform_id (connected_platform_id) to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts 
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.connected_platforms(id) ON DELETE SET NULL;

-- Add platform_id (connected_platform_id) to tiktok_ad_accounts
ALTER TABLE public.tiktok_ad_accounts 
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.connected_platforms(id) ON DELETE SET NULL;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_platform_id ON public.meta_ad_accounts(platform_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_platform_id ON public.tiktok_ad_accounts(platform_id);
