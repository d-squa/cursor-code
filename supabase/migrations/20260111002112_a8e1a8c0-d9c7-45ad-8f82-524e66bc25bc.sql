-- Create a table to track creative push jobs for automated retry
CREATE TABLE public.creative_push_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paused')),
  total_assignments INTEGER DEFAULT 0,
  pushed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creative_push_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view their own push jobs" 
ON public.creative_push_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create their own push jobs" 
ON public.creative_push_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update their own push jobs" 
ON public.creative_push_jobs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to push jobs"
ON public.creative_push_jobs
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for efficient querying
CREATE INDEX idx_creative_push_jobs_campaign ON public.creative_push_jobs(campaign_id);
CREATE INDEX idx_creative_push_jobs_status ON public.creative_push_jobs(status);

-- Add trigger for updated_at
CREATE TRIGGER update_creative_push_jobs_updated_at
BEFORE UPDATE ON public.creative_push_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();