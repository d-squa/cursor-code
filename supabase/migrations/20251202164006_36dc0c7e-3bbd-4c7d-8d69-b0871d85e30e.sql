-- Add Advantage+ placements column to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_advantage_plus_placements boolean DEFAULT true;