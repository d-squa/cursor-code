-- Drop the old unique constraint that doesn't include platform, causing Meta/TikTok data to overwrite each other
ALTER TABLE public.campaign_performance_benchmarks 
DROP CONSTRAINT IF EXISTS campaign_performance_benchmar_user_id_market_optimization_g_key;