-- ============================================
-- CRITICAL SECURITY FIX: OAuth Token Protection
-- ============================================
-- Move sensitive OAuth tokens out of client-accessible columns
-- and create safe views for client-side queries

-- Step 1: Create safe view for connected_platforms (without tokens)
CREATE VIEW connected_platforms_safe AS
SELECT 
  id,
  user_id,
  platform_type,
  platform_name,
  ad_account_id,
  ad_account_name,
  business_manager_id,
  is_active,
  metadata,
  token_expires_at,
  created_at,
  updated_at
FROM connected_platforms;

-- Grant access to authenticated users
GRANT SELECT ON connected_platforms_safe TO authenticated;

-- Enable RLS on the view
ALTER VIEW connected_platforms_safe SET (security_invoker = true);

-- Step 2: Create safe view for meta_pages (without access_token)
CREATE VIEW meta_pages_safe AS
SELECT 
  id,
  user_id,
  page_id,
  page_name,
  category,
  synced_at,
  created_at
FROM meta_pages;

-- Grant access to authenticated users
GRANT SELECT ON meta_pages_safe TO authenticated;

-- Enable RLS on the view
ALTER VIEW meta_pages_safe SET (security_invoker = true);

-- Step 3: Add UPDATE policy to platform_accounts
CREATE POLICY "Users can update their platform accounts"
ON platform_accounts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

-- Step 4: Add BO number format validation
ALTER TABLE campaigns
ADD CONSTRAINT bo_number_format 
CHECK (bo_number IS NULL OR bo_number ~ '^[A-Z0-9-]{3,50}$');