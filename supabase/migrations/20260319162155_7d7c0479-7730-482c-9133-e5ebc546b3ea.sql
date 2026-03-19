
ALTER TABLE public.campaign_performance_benchmarks
  ADD COLUMN IF NOT EXISTS clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_ctr numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avg_roas numeric DEFAULT NULL;
