-- Add team_id column to meta_ad_accounts for workspace scoping
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Add team_id column to tiktok_ad_accounts for workspace scoping
ALTER TABLE public.tiktok_ad_accounts
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_team_id ON public.meta_ad_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_team_id ON public.tiktok_ad_accounts(team_id);

-- Drop existing RLS policies for meta_ad_accounts
DROP POLICY IF EXISTS "Users can view their own or shared client ad accounts" ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Users can insert their own ad accounts" ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Users can update their own or shared client ad accounts" ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Users can delete their own ad accounts" ON public.meta_ad_accounts;

-- Create new workspace-scoped RLS policies for meta_ad_accounts
CREATE POLICY "Users can view ad accounts in their team"
ON public.meta_ad_accounts
FOR SELECT
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = meta_ad_accounts.team_id
    AND ur.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can insert ad accounts in their team"
ON public.meta_ad_accounts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (team_id IS NULL OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = meta_ad_accounts.team_id
    AND ur.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can update ad accounts in their team"
ON public.meta_ad_accounts
FOR UPDATE
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = meta_ad_accounts.team_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin')
  ))
);

CREATE POLICY "Users can delete ad accounts in their team"
ON public.meta_ad_accounts
FOR DELETE
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = meta_ad_accounts.team_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin')
  ))
);

-- Drop existing RLS policies for tiktok_ad_accounts
DROP POLICY IF EXISTS "Users can view their own or shared client TikTok ad accounts" ON public.tiktok_ad_accounts;
DROP POLICY IF EXISTS "Users can insert their own TikTok ad accounts" ON public.tiktok_ad_accounts;
DROP POLICY IF EXISTS "Users can update their own or shared client TikTok ad accounts" ON public.tiktok_ad_accounts;
DROP POLICY IF EXISTS "Users can delete their own TikTok ad accounts" ON public.tiktok_ad_accounts;

-- Create new workspace-scoped RLS policies for tiktok_ad_accounts
CREATE POLICY "Users can view TikTok ad accounts in their team"
ON public.tiktok_ad_accounts
FOR SELECT
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = tiktok_ad_accounts.team_id
    AND ur.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can insert TikTok ad accounts in their team"
ON public.tiktok_ad_accounts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (team_id IS NULL OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = tiktok_ad_accounts.team_id
    AND ur.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can update TikTok ad accounts in their team"
ON public.tiktok_ad_accounts
FOR UPDATE
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = tiktok_ad_accounts.team_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin')
  ))
);

CREATE POLICY "Users can delete TikTok ad accounts in their team"
ON public.tiktok_ad_accounts
FOR DELETE
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.team_id = tiktok_ad_accounts.team_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin')
  ))
);

-- Also add team_id to connected_platforms for proper workspace scoping
ALTER TABLE public.connected_platforms
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connected_platforms_team_id ON public.connected_platforms(team_id);