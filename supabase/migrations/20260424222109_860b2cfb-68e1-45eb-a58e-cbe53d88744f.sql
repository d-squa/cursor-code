ALTER TABLE public.campaign_launch_status
  DROP CONSTRAINT IF EXISTS campaign_launch_status_status_check;

ALTER TABLE public.campaign_launch_status
  ADD CONSTRAINT campaign_launch_status_status_check
  CHECK (status IN (
    'pending',
    'ready_for_push',
    'pushing',
    'pushed_to_dsp',
    'live',
    'push_failed',
    'paused',
    'awaiting_assets',
    'assets_incomplete'
  ));

UPDATE public.campaign_launch_status
SET status = 'awaiting_assets',
    dsp_entity_id = NULL,
    error_message = NULL,
    error_details = NULL,
    updated_at = now()
WHERE platform = 'Google Ads'
  AND entity_type = 'adset'
  AND status IN ('pushed_to_dsp', 'live')
  AND entity_name ILIKE 'PMAX%'
  AND (dsp_entity_id IS NULL OR dsp_entity_id NOT LIKE '%/assetGroups/%');