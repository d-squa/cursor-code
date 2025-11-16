-- Create table for campaign performance benchmarks
CREATE TABLE public.campaign_performance_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  market TEXT NOT NULL,
  optimization_goal TEXT NOT NULL,
  avg_cost_per_result NUMERIC,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  total_results NUMERIC NOT NULL DEFAULT 0,
  impressions NUMERIC NOT NULL DEFAULT 0,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, market, optimization_goal, date_range_start, date_range_end)
);

-- Enable RLS
ALTER TABLE public.campaign_performance_benchmarks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own benchmarks"
ON public.campaign_performance_benchmarks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own benchmarks"
ON public.campaign_performance_benchmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own benchmarks"
ON public.campaign_performance_benchmarks
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own benchmarks"
ON public.campaign_performance_benchmarks
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_benchmarks_user_market_goal ON public.campaign_performance_benchmarks(user_id, market, optimization_goal);

-- Create trigger for updated_at
CREATE TRIGGER update_benchmarks_updated_at
BEFORE UPDATE ON public.campaign_performance_benchmarks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();