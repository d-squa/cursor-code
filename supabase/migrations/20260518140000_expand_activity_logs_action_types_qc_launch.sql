-- Allow action_type values emitted by Launch Status, QC tracking, and Log Action flows.
ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'budget_adjustment',
    'targeting_change',
    'creative_update',
    'campaign_pause_resume',
    'pause_resume',
    'audience_update',
    'bid_change',
    'schedule_modification',
    'landing_page_change',
    'ad_copy_change',
    'placement_update',
    'conversion_setup',
    'reporting_delivery',
    'setup_mistake',
    'note',
    'other',
    'campaign_shell_push',
    'creative_push',
    'qc_transition',
    'qc_check_completed',
    'qc_check_reopened',
    'qc_bulk_check_completed',
    'qc_bulk_check_reopened'
  ]::text[]));
