-- Update RLS policies for meta_ad_accounts to allow team access via client
-- Users can view ad accounts if:
-- 1. They own the ad account (user_id = auth.uid())
-- 2. OR the ad account is linked to a client they have access to via team

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own ad accounts" ON meta_ad_accounts;

-- Create new SELECT policy that includes team access
CREATE POLICY "Users can view their own or team client ad accounts" 
ON meta_ad_accounts 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR (
    client_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM team_clients tc
      JOIN user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = meta_ad_accounts.client_id
      AND ur.user_id = auth.uid()
    )
  )
);

-- Update UPDATE policy to allow team members to update ad account defaults for shared clients
DROP POLICY IF EXISTS "Users can update their own ad accounts" ON meta_ad_accounts;

CREATE POLICY "Users can update their own or team client ad accounts" 
ON meta_ad_accounts 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR (
    client_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM team_clients tc
      JOIN user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = meta_ad_accounts.client_id
      AND ur.user_id = auth.uid()
    )
  )
);

-- Same for tiktok_ad_accounts
DROP POLICY IF EXISTS "Users can view their own TikTok ad accounts" ON tiktok_ad_accounts;

CREATE POLICY "Users can view their own or team client TikTok ad accounts" 
ON tiktok_ad_accounts 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR (
    client_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM team_clients tc
      JOIN user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = tiktok_ad_accounts.client_id
      AND ur.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can update their own TikTok ad accounts" ON tiktok_ad_accounts;

CREATE POLICY "Users can update their own or team client TikTok ad accounts" 
ON tiktok_ad_accounts 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR (
    client_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM team_clients tc
      JOIN user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = tiktok_ad_accounts.client_id
      AND ur.user_id = auth.uid()
    )
  )
);