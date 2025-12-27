-- Allow admins and team members (via client visibility) to view/update ad accounts linked to shared clients

-- META: SELECT
DROP POLICY IF EXISTS "Users can view their own or team client ad accounts" ON public.meta_ad_accounts;
CREATE POLICY "Users can view their own or shared client ad accounts"
ON public.meta_ad_accounts
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_clients tc
      JOIN public.user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = meta_ad_accounts.client_id
        AND ur.user_id = auth.uid()
    )
  )
);

-- META: UPDATE
DROP POLICY IF EXISTS "Users can update their own or team client ad accounts" ON public.meta_ad_accounts;
CREATE POLICY "Users can update their own or shared client ad accounts"
ON public.meta_ad_accounts
FOR UPDATE
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_clients tc
      JOIN public.user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = meta_ad_accounts.client_id
        AND ur.user_id = auth.uid()
    )
  )
);

-- TIKTOK: SELECT
DROP POLICY IF EXISTS "Users can view their own or team client TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can view their own or shared client TikTok ad accounts"
ON public.tiktok_ad_accounts
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_clients tc
      JOIN public.user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = tiktok_ad_accounts.client_id
        AND ur.user_id = auth.uid()
    )
  )
);

-- TIKTOK: UPDATE
DROP POLICY IF EXISTS "Users can update their own or team client TikTok ad accounts" ON public.tiktok_ad_accounts;
CREATE POLICY "Users can update their own or shared client TikTok ad accounts"
ON public.tiktok_ad_accounts
FOR UPDATE
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_clients tc
      JOIN public.user_roles ur ON ur.team_id = tc.team_id
      WHERE tc.client_id = tiktok_ad_accounts.client_id
        AND ur.user_id = auth.uid()
    )
  )
);
