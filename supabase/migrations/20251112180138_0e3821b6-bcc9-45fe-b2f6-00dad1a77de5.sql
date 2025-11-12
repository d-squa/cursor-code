-- Add product sets table
CREATE TABLE IF NOT EXISTS public.meta_product_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL,
  product_set_id TEXT NOT NULL,
  product_set_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_set_id)
);

-- Enable RLS
ALTER TABLE public.meta_product_sets ENABLE ROW LEVEL SECURITY;

-- RLS policies for product sets
CREATE POLICY "Users can view their own product sets"
  ON public.meta_product_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own product sets"
  ON public.meta_product_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own product sets"
  ON public.meta_product_sets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own product sets"
  ON public.meta_product_sets FOR DELETE
  USING (auth.uid() = user_id);

-- Add default_product_set_id to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_product_set_id TEXT;