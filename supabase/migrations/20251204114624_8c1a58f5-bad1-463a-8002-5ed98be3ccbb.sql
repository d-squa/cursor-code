-- Add Meta messaging channel fields for manual mode
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_messenger_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_instagram_dm_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_whatsapp_enabled boolean DEFAULT false;