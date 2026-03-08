-- Create google_ad_accounts table (mirrors meta_ad_accounts / tiktok_ad_accounts pattern)
CREATE TABLE public.google_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  platform_id UUID REFERENCES public.connected_platforms(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  account_status TEXT,
  currency TEXT,
  timezone TEXT,
  manager_customer_id TEXT,
  descriptive_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.google_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google ad accounts"
  ON public.google_ad_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own google ad accounts"
  ON public.google_ad_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own google ad accounts"
  ON public.google_ad_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own google ad accounts"
  ON public.google_ad_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Team members can view google ad accounts in their workspace
CREATE POLICY "Team members can view google ad accounts"
  ON public.google_ad_accounts FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT ur.team_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
  );

-- Updated at trigger
CREATE TRIGGER update_google_ad_accounts_updated_at
  BEFORE UPDATE ON public.google_ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update count_linked_ad_accounts function to include google
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
      ELSE 0
    END
$$;