ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
