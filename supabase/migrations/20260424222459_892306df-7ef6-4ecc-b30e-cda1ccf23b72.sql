-- Shopping ad-set rows were incorrectly swept into awaiting_assets by the
-- previous cleanup. Restore them using the parent campaign's dsp_entity_id.
UPDATE public.campaign_launch_status AS cs
SET status = 'pushed_to_dsp',
    dsp_entity_id = parent.dsp_entity_id,
    updated_at = now()
FROM public.campaign_launch_status AS parent
WHERE cs.status = 'awaiting_assets'
  AND cs.entity_type = 'adset'
  AND cs.platform = 'Google Ads'
  AND lower(cs.phase_name) NOT LIKE '%performance%'
  AND lower(cs.phase_name) NOT LIKE '%pmax%'
  AND lower(cs.phase_name) NOT LIKE '%p-max%'
  AND lower(cs.phase_name) NOT LIKE '%product discovery%'
  AND parent.campaign_id = cs.campaign_id
  AND parent.entity_type = 'campaign'
  AND parent.market = cs.market
  AND parent.phase_name = cs.phase_name
  AND parent.status IN ('pushed_to_dsp', 'live');