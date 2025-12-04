-- Add basic targeting defaults to clients table (client-level, not account-level)
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS default_age_min integer DEFAULT 18,
ADD COLUMN IF NOT EXISTS default_age_max integer DEFAULT 65,
ADD COLUMN IF NOT EXISTS default_gender text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS default_devices jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_languages jsonb DEFAULT '[]'::jsonb;