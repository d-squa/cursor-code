-- Create table to track ad account swap events for auditing and limit enforcement
CREATE TABLE IF NOT EXISTS public.ad_account_swap_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  previous_account_id TEXT NOT NULL,
  new_account_id TEXT NOT NULL,
  swap_type TEXT NOT NULL DEFAULT 'swap' CHECK (swap_type IN ('swap', 'initial', 'reconnect', 'oauth_refresh')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_account_swap_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own swap logs"
  ON public.ad_account_swap_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own swap logs"
  ON public.ad_account_swap_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ad_account_swap_logs_user_platform_date 
  ON public.ad_account_swap_logs (user_id, platform, created_at);

-- Create function to count swaps in current calendar month (UTC)
CREATE OR REPLACE FUNCTION public.count_swaps_this_month(
  _user_id UUID,
  _platform TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.ad_account_swap_logs
  WHERE user_id = _user_id
    AND platform = _platform
    AND swap_type = 'swap'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
$$;

-- Create function to get linked ad account count per platform
CREATE OR REPLACE FUNCTION public.count_linked_ad_accounts(
  _user_id UUID,
  _platform TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE _platform
      WHEN 'meta' THEN (
        SELECT COUNT(*)::INTEGER FROM public.meta_ad_accounts WHERE user_id = _user_id
      )
      WHEN 'tiktok' THEN (
        SELECT COUNT(*)::INTEGER FROM public.tiktok_ad_accounts WHERE user_id = _user_id
      )
      ELSE 0
    END
$$;

-- Add user_id column to meta_ad_accounts and tiktok_ad_accounts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'meta_ad_accounts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.meta_ad_accounts ADD COLUMN user_id UUID;
    -- Update existing records to have user_id from connected_platforms
    UPDATE public.meta_ad_accounts ma
    SET user_id = cp.user_id
    FROM public.connected_platforms cp
    WHERE cp.platform_type = 'meta';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tiktok_ad_accounts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.tiktok_ad_accounts ADD COLUMN user_id UUID;
    -- Update existing records
    UPDATE public.tiktok_ad_accounts ta
    SET user_id = cp.user_id
    FROM public.connected_platforms cp
    WHERE cp.platform_type = 'tiktok';
  END IF;
END $$;