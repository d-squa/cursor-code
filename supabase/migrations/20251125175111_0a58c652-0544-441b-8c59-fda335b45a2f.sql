-- Create tiktok_product_sets table
CREATE TABLE IF NOT EXISTS public.tiktok_product_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  product_set_id TEXT NOT NULL,
  product_set_name TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_set_id, advertiser_id)
);

-- Enable RLS
ALTER TABLE public.tiktok_product_sets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own TikTok product sets"
  ON public.tiktok_product_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok product sets"
  ON public.tiktok_product_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok product sets"
  ON public.tiktok_product_sets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok product sets"
  ON public.tiktok_product_sets FOR DELETE
  USING (auth.uid() = user_id);

-- Add default_product_set_id to tiktok_ad_accounts if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tiktok_ad_accounts' 
    AND column_name = 'default_product_set_id'
  ) THEN
    ALTER TABLE public.tiktok_ad_accounts 
    ADD COLUMN default_product_set_id TEXT;
  END IF;
END $$;