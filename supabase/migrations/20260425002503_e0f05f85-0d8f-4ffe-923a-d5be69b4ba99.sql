UPDATE public.campaign_launch_status
SET status = 'awaiting_assets',
    error_message = NULL,
    updated_at = now()
WHERE platform = 'Google Ads'
  AND entity_type = 'adset'
  AND status = 'pushing';