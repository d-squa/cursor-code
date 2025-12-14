-- Create table for saved insights analyses
CREATE TABLE public.saved_insights_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  breakdowns TEXT[] NOT NULL DEFAULT '{}',
  time_comparison TEXT NOT NULL,
  analysis_result TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_insights_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own saved analyses" 
ON public.saved_insights_analyses 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved analyses" 
ON public.saved_insights_analyses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved analyses" 
ON public.saved_insights_analyses 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_saved_insights_user_id ON public.saved_insights_analyses(user_id);
CREATE INDEX idx_saved_insights_created_at ON public.saved_insights_analyses(created_at DESC);