-- Seed core tour/sample campaign data so Overview, Performance, and Launch Status render.

ALTER TABLE public.campaign_insights
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE public.campaign_launch_status
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE public.activity_logs
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE public.campaign_change_history
ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  v_campaign_id uuid := '6fd5d93f-1f91-4e08-b7b8-9a2e0f1e6f55'::uuid;
  v_user_id uuid := 'a286c88e-cd14-45af-94df-45ac2eb8d835'::uuid;
  v_team_id uuid := '22d74f6d-437e-4272-80e6-7c06da263434'::uuid;
BEGIN
  -- 1) Campaign (sample mode: true, status live)
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id = v_campaign_id) THEN
    INSERT INTO public.campaigns (
      id,
      user_id,
      team_id,
      name,
      objective,
      status,
      total_budget,
      budget_allocation,
      platforms,
      market_splits,
      forecast_data,
      generic_config,
      start_date,
      end_date,
      is_sample,
      bo_number
    )
    VALUES (
      v_campaign_id,
      v_user_id,
      v_team_id,
      'Sample | Q4 Full Funnel Growth',
      'sales',
      'live',
      25000,
      '{"meta": 9000, "google": 9000, "tiktok": 7000}'::jsonb,
      '["meta","google","tiktok"]'::jsonb,
      '[{"market":"United States","weight":0.7},{"market":"United Kingdom","weight":0.3}]'::jsonb,
      '{
        "totalMetrics": {
          "reach": 420000,
          "impressions": 1650000,
          "clicks": 23800,
          "conversions": 1670
        },
        "weeks": 6
      }'::jsonb,
      '{"notes":"Seeded sample dataset for dashboard visibility"}'::jsonb,
      (now() - interval '21 days')::date,
      (now() + interval '21 days')::date,
      true,
      'SAMPLE-Q4-2026'
    );
  END IF;

  -- 2) Campaign insights (drives Performance + Overview metrics)
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_insights
    WHERE campaign_id = v_campaign_id AND platform = 'meta'
  ) THEN
    INSERT INTO public.campaign_insights (
      campaign_id,
      platform,
      ad_account_id,
      campaign_dsp_id,
      metrics,
      weekly_metrics,
      fetched_at,
      is_sample
    )
    VALUES (
      v_campaign_id,
      'meta',
      'sample_meta_123456',
      'meta_campaign_sample_001',
      '{
        "reach": 184500,
        "impressions": 742000,
        "spend": 8120.44,
        "clicks": 10810,
        "frequency": 2.13
      }'::jsonb,
      '[
        {"week":"W1","reach":25200,"impressions":101100,"spend":1045.10,"clicks":1510},
        {"week":"W2","reach":28700,"impressions":116300,"spend":1210.55,"clicks":1680},
        {"week":"W3","reach":30900,"impressions":124400,"spend":1340.26,"clicks":1810},
        {"week":"W4","reach":33200,"impressions":133500,"spend":1456.90,"clicks":1950},
        {"week":"W5","reach":34900,"impressions":138900,"spend":1521.45,"clicks":2010},
        {"week":"W6","reach":36600,"impressions":127800,"spend":1546.18,"clicks":1850}
      ]'::jsonb,
      now(),
      true
    );
  END IF;

  -- 3) Launch status rows (drives Launch Status page)
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_launch_status
    WHERE campaign_id = v_campaign_id AND platform = 'meta' AND entity_type = 'campaign'
  ) THEN
    INSERT INTO public.campaign_launch_status (
      campaign_id,
      platform,
      market,
      entity_type,
      entity_name,
      phase_name,
      status,
      dsp_status,
      dsp_entity_id,
      planned_budget,
      planned_impressions,
      planned_clicks,
      planned_reach,
      planned_conversions,
      last_checked_at,
      is_sample
    )
    VALUES
      (v_campaign_id, 'meta', 'United States', 'campaign', 'Sample | Meta US Campaign', 'Phase 1', 'live', 'ACTIVE', 'meta_cmp_001', 9000, 540000, 8200, 132000, 640, now(), true),
      (v_campaign_id, 'google', 'United States', 'campaign', 'Sample | Google US Campaign', 'Phase 1', 'live', 'ENABLED', 'gads_cmp_001', 9000, 620000, 9400, 154000, 710, now(), true),
      (v_campaign_id, 'tiktok', 'United States', 'campaign', 'Sample | TikTok US Campaign', 'Phase 1', 'live', 'ACTIVE', 'tt_cmp_001', 7000, 490000, 6200, 118000, 520, now(), true);
  END IF;

  -- 4) Change history (overview change feed)
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_change_history
    WHERE campaign_id = v_campaign_id
      AND action = 'Budget rebalanced by platform'
  ) THEN
    INSERT INTO public.campaign_change_history (
      campaign_id,
      user_id,
      action,
      change_type,
      description,
      is_sample
    )
    VALUES (
      v_campaign_id,
      v_user_id,
      'Budget rebalanced by platform',
      'budget',
      'Shifted 8% budget from Meta to Google based on lower CPA trend.',
      true
    );
  END IF;
END $$;
