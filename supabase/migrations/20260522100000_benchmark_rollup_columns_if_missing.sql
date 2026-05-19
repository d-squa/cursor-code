-- Edge upserts send clicks, link_clicks, landing_page_views, revenue (see sync-*-benchmarks).
-- PostgREST PGRST204 = column in request not in schema cache (missing column or stale cache).

ALTER TABLE public.campaign_performance_benchmarks
  ADD COLUMN IF NOT EXISTS clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0;
