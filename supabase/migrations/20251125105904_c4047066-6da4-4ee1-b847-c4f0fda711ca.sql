-- Create TikTok pixels table
CREATE TABLE IF NOT EXISTS public.tiktok_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  pixel_id TEXT NOT NULL,
  pixel_name TEXT NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(pixel_id, advertiser_id)
);

-- Create TikTok identities table (TikTok's equivalent of Instagram accounts)
CREATE TABLE IF NOT EXISTS public.tiktok_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  identity_name TEXT NOT NULL,
  identity_type TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(identity_id, advertiser_id)
);

-- Create TikTok catalogs table
CREATE TABLE IF NOT EXISTS public.tiktok_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  catalog_name TEXT NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(catalog_id, advertiser_id)
);

-- Enable RLS on TikTok pixels
ALTER TABLE public.tiktok_pixels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own TikTok pixels"
ON public.tiktok_pixels FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok pixels"
ON public.tiktok_pixels FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok pixels"
ON public.tiktok_pixels FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok pixels"
ON public.tiktok_pixels FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on TikTok identities
ALTER TABLE public.tiktok_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own TikTok identities"
ON public.tiktok_identities FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok identities"
ON public.tiktok_identities FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok identities"
ON public.tiktok_identities FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok identities"
ON public.tiktok_identities FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on TikTok catalogs
ALTER TABLE public.tiktok_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own TikTok catalogs"
ON public.tiktok_catalogs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok catalogs"
ON public.tiktok_catalogs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok catalogs"
ON public.tiktok_catalogs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok catalogs"
ON public.tiktok_catalogs FOR DELETE
USING (auth.uid() = user_id);