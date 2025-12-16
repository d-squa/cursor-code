-- Fix views to properly enforce RLS from base tables
-- PostgreSQL views with security_invoker = true will check RLS on underlying tables

-- Recreate meta_pages_safe view with security_invoker
DROP VIEW IF EXISTS public.meta_pages_safe;
CREATE VIEW public.meta_pages_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  page_id,
  page_name,
  category,
  synced_at,
  created_at
FROM public.meta_pages;

-- Grant appropriate permissions
GRANT SELECT ON public.meta_pages_safe TO authenticated;

-- Recreate connected_platforms_safe view with security_invoker  
DROP VIEW IF EXISTS public.connected_platforms_safe;
CREATE VIEW public.connected_platforms_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  platform_type,
  platform_name,
  ad_account_id,
  ad_account_name,
  business_manager_id,
  metadata,
  is_active,
  token_expires_at,
  created_at,
  updated_at
FROM public.connected_platforms;

-- Grant appropriate permissions
GRANT SELECT ON public.connected_platforms_safe TO authenticated;