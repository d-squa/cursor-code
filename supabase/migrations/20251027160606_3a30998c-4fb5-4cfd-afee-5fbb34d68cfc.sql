-- Create table for storing connected platform accounts
CREATE TABLE public.connected_platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform_type TEXT NOT NULL, -- 'meta', 'google_ads', 'linkedin', 'tiktok'
  platform_name TEXT NOT NULL, -- Display name for the connection
  access_token TEXT, -- Encrypted access token
  refresh_token TEXT, -- Encrypted refresh token
  token_expires_at TIMESTAMP WITH TIME ZONE,
  ad_account_id TEXT, -- Platform-specific ad account ID
  ad_account_name TEXT,
  business_manager_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional platform-specific data
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.connected_platforms ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own connected platforms"
ON public.connected_platforms
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connected platforms"
ON public.connected_platforms
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connected platforms"
ON public.connected_platforms
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connected platforms"
ON public.connected_platforms
FOR DELETE
USING (auth.uid() = user_id);

-- Create table for storing platform-specific accounts (pages, instagram accounts, etc.)
CREATE TABLE public.platform_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connected_platform_id UUID NOT NULL REFERENCES public.connected_platforms(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL, -- 'facebook_page', 'instagram_account', 'pixel', 'catalog'
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their platform accounts"
ON public.platform_accounts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their platform accounts"
ON public.platform_accounts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their platform accounts"
ON public.platform_accounts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_connected_platforms_updated_at
BEFORE UPDATE ON public.connected_platforms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_connected_platforms_user_id ON public.connected_platforms(user_id);
CREATE INDEX idx_connected_platforms_platform_type ON public.connected_platforms(platform_type);
CREATE INDEX idx_platform_accounts_connected_platform_id ON public.platform_accounts(connected_platform_id);