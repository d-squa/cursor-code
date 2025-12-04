-- Create table to store TikTok apps from data source
CREATE TABLE public.tiktok_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  advertiser_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_type TEXT, -- ios, android
  download_url TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, advertiser_id, app_id)
);

-- Enable RLS
ALTER TABLE public.tiktok_apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own TikTok apps" 
ON public.tiktok_apps FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok apps" 
ON public.tiktok_apps FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok apps" 
ON public.tiktok_apps FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok apps" 
ON public.tiktok_apps FOR DELETE 
USING (auth.uid() = user_id);