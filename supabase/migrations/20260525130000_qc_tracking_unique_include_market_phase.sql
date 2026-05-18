-- QC seeds are scoped per market and phase; the old unique key dropped rows that shared
-- (campaign_id, platform, dsp_entity_id, entity_type) across markets/phases.

ALTER TABLE public.qc_tracking
  DROP CONSTRAINT IF EXISTS qc_tracking_campaign_id_platform_dsp_entity_id_entity_type_key;

DROP INDEX IF EXISTS public.qc_tracking_entity_scope_unique;

CREATE UNIQUE INDEX qc_tracking_entity_scope_unique
  ON public.qc_tracking (
    campaign_id,
    platform,
    entity_type,
    COALESCE(dsp_entity_id, ''),
    COALESCE(market, ''),
    COALESCE(phase_name, '')
  );
