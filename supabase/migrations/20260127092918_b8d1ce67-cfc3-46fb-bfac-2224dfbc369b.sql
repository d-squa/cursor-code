-- Add platform column to campaign_performance_benchmarks
ALTER TABLE public.campaign_performance_benchmarks 
ADD COLUMN platform text NOT NULL DEFAULT 'meta';

-- Drop the existing unique constraint
ALTER TABLE public.campaign_performance_benchmarks 
DROP CONSTRAINT IF EXISTS campaign_performance_benchmarks_user_id_market_optimization__key;

-- Create new unique constraint including platform
ALTER TABLE public.campaign_performance_benchmarks 
ADD CONSTRAINT campaign_performance_benchmarks_unique_key 
UNIQUE (user_id, platform, market, optimization_goal, industry, date_range_start, date_range_end);

-- Create index for faster lookups by platform
CREATE INDEX IF NOT EXISTS idx_benchmarks_platform 
ON public.campaign_performance_benchmarks(platform);