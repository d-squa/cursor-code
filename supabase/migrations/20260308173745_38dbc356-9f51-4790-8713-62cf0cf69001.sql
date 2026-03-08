
-- Create snapchat_ad_accounts table (mirrors meta_ad_accounts / tiktok_ad_accounts pattern)
CREATE TABLE public.snapchat_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  advertiser_id TEXT NOT NULL,
  organization_id TEXT,
  account_status TEXT DEFAULT 'ACTIVE',
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'UTC',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, advertiser_id)
);

-- Enable RLS
ALTER TABLE public.snapchat_ad_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own snapchat ad accounts" ON public.snapchat_ad_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR team_id IN (
    SELECT ur.team_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own snapchat ad accounts" ON public.snapchat_ad_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own snapchat ad accounts" ON public.snapchat_ad_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own snapchat ad accounts" ON public.snapchat_ad_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER set_updated_at_snapchat_ad_accounts
  BEFORE UPDATE ON public.snapchat_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update count_linked_ad_accounts function to include snapchat
CREATE OR REPLACE FUNCTION public.count_linked_ad_accounts(_user_id uuid, _platform text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE _platform
      WHEN 'meta' THEN (
        SELECT COUNT(*)::INTEGER FROM public.meta_ad_accounts WHERE user_id = _user_id
      )
      WHEN 'tiktok' THEN (
        SELECT COUNT(*)::INTEGER FROM public.tiktok_ad_accounts WHERE user_id = _user_id
      )
      WHEN 'google' THEN (
        SELECT COUNT(*)::INTEGER FROM public.google_ad_accounts WHERE user_id = _user_id
      )
      WHEN 'snapchat' THEN (
        SELECT COUNT(*)::INTEGER FROM public.snapchat_ad_accounts WHERE user_id = _user_id
      )
      ELSE 0
    END
$$;
