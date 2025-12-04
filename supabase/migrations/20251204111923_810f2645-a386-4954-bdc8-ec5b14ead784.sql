-- Add destination-specific fields for Meta ad accounts
ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_app_store text,
ADD COLUMN IF NOT EXISTS default_app_id text,
ADD COLUMN IF NOT EXISTS default_whatsapp_number text,
ADD COLUMN IF NOT EXISTS default_messaging_mode text DEFAULT 'AUTOMATIC';

-- Add destination-specific fields for TikTok ad accounts
ALTER TABLE public.tiktok_ad_accounts 
ADD COLUMN IF NOT EXISTS default_messaging_app text,
ADD COLUMN IF NOT EXISTS default_facebook_page_id text,
ADD COLUMN IF NOT EXISTS default_message_event_set text,
ADD COLUMN IF NOT EXISTS default_whatsapp_number text,
ADD COLUMN IF NOT EXISTS default_zalo_account_id text,
ADD COLUMN IF NOT EXISTS default_line_business_id text;

-- Add comments for documentation
COMMENT ON COLUMN public.meta_ad_accounts.default_app_store IS 'Store for app destination: google_play, apple_app_store, apple_ipad, facebook_canvas, amazon, games, meta_quest';
COMMENT ON COLUMN public.meta_ad_accounts.default_app_id IS 'App identifier from the selected store';
COMMENT ON COLUMN public.meta_ad_accounts.default_whatsapp_number IS 'WhatsApp business number for messaging destination';
COMMENT ON COLUMN public.meta_ad_accounts.default_messaging_mode IS 'AUTOMATIC or MANUAL for messaging destination';

COMMENT ON COLUMN public.tiktok_ad_accounts.default_messaging_app IS 'Messaging app: messenger, whatsapp, zalo, line, url';
COMMENT ON COLUMN public.tiktok_ad_accounts.default_facebook_page_id IS 'Facebook page ID for Messenger destination';
COMMENT ON COLUMN public.tiktok_ad_accounts.default_message_event_set IS 'Message event set for conversation goals';
COMMENT ON COLUMN public.tiktok_ad_accounts.default_whatsapp_number IS 'WhatsApp number for WhatsApp destination';
COMMENT ON COLUMN public.tiktok_ad_accounts.default_zalo_account_id IS 'Zalo Official Account ID or phone number';
COMMENT ON COLUMN public.tiktok_ad_accounts.default_line_business_id IS 'LINE Business ID for LINE destination';