-- Backfill: link existing sample ad accounts to D-squad client and fix Q1 demo campaign market_splits
DO $$
DECLARE
  v_user_id uuid := '558984d6-0ef2-430a-b29d-f47feda1a94c';
  v_client_id uuid := 'e3e79318-31cc-4f3d-a171-af45075274c3';
  v_q1_start text := '2026-01-15';
  v_q1_end text := '2026-03-31';
  v_splits jsonb;
BEGIN
  -- Link sample ad accounts to D-squad
  UPDATE public.meta_ad_accounts SET client_id = v_client_id
  WHERE is_sample = true AND user_id = v_user_id AND client_id IS NULL;

  UPDATE public.tiktok_ad_accounts SET client_id = v_client_id
  WHERE is_sample = true AND user_id = v_user_id AND client_id IS NULL;

  UPDATE public.google_ad_accounts SET client_id = v_client_id
  WHERE is_sample = true AND user_id = v_user_id AND client_id IS NULL;

  -- Rebuild Q1 demo campaign market_splits with proper structure
  v_splits := jsonb_build_object(
    'meta', jsonb_build_array(
      jsonb_build_object(
        'id','q1-meta-us','name','United States','budgetPercentage',60,
        'adAccountId','act_sample_123456','accountName','[Sample] D-squad — Meta US',
        'pageId','sample_page_123','page','Demo Brand','pixel','sample_pixel_456',
        'countries', jsonb_build_array('US'),'ageMin',18,'ageMax',54,'gender','all',
        'adFormats', jsonb_build_array('Video ads','Image ads'),
        'strategy','full_funnel','strategyFocus','conversions',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-m-us-tof','name','TOF - Demand Capture','funnelStage','TOF',
            'objective','OUTCOME_SALES','optimizationGoal','OFFSITE_CONVERSIONS',
            'budgetPercentage',50,'budgetType','daily',
            'startDate',v_q1_start,'endDate','2026-02-22',
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-1','name','Broad + LAL','budgetPercentage',100,'dimensionValue','broad'))),
          jsonb_build_object('id','q1-m-us-mof','name','MOF - Intent Amplification','funnelStage','MOF',
            'objective','OUTCOME_SALES','optimizationGoal','OFFSITE_CONVERSIONS',
            'budgetPercentage',30,'budgetType','daily',
            'startDate','2026-02-22','endDate','2026-03-16',
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-2','name','Engagers + Visitors','budgetPercentage',100,'dimensionValue','retarget'))),
          jsonb_build_object('id','q1-m-us-bof','name','BOF - Conversion Recovery','funnelStage','BOF',
            'objective','OUTCOME_SALES','optimizationGoal','OFFSITE_CONVERSIONS',
            'budgetPercentage',20,'budgetType','daily',
            'startDate','2026-03-16','endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-3','name','ATC + IC','budgetPercentage',100,'dimensionValue','retarget')))
        )
      ),
      jsonb_build_object(
        'id','q1-meta-uk','name','United Kingdom','budgetPercentage',40,
        'adAccountId','act_sample_999888','accountName','[Sample] D-squad — Meta EU',
        'pageId','sample_page_uk','page','Demo Brand UK','pixel','sample_pixel_eu',
        'countries', jsonb_build_array('GB'),'ageMin',18,'ageMax',54,'gender','all',
        'adFormats', jsonb_build_array('Video ads','Image ads'),
        'strategy','full_funnel','strategyFocus','conversions',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-m-uk-tof','name','TOF','funnelStage','TOF',
            'objective','OUTCOME_AWARENESS','optimizationGoal','REACH',
            'budgetPercentage',60,'budgetType','daily',
            'startDate',v_q1_start,'endDate','2026-02-28',
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-uk-1','name','Broad UK','budgetPercentage',100,'dimensionValue','broad'))),
          jsonb_build_object('id','q1-m-uk-bof','name','BOF','funnelStage','BOF',
            'objective','OUTCOME_SALES','optimizationGoal','OFFSITE_CONVERSIONS',
            'budgetPercentage',40,'budgetType','daily',
            'startDate','2026-02-28','endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-uk-2','name','Retargeting UK','budgetPercentage',100,'dimensionValue','retarget')))
        )
      )
    ),
    'tiktok', jsonb_build_array(
      jsonb_build_object(
        'id','q1-tt-us','name','United States','budgetPercentage',70,
        'adAccountId','sample_tt_789012','accountName','[Sample] D-squad — TikTok US',
        'tiktokPixel','sample_tt_pixel','countries', jsonb_build_array('US'),
        'ageMin',18,'ageMax',45,'gender','all','adFormats', jsonb_build_array('In-Feed ads'),
        'tiktokOptimizationLocation','WEBSITE',
        'strategy','full_funnel','strategyFocus','traffic',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-tt-us-aw','name','Awareness','funnelStage','awareness',
            'objective','REACH','optimizationGoal','REACH',
            'budgetPercentage',50,'budgetType','daily',
            'startDate',v_q1_start,'endDate','2026-02-22',
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-tt-1','name','Gen Z & Millennials','budgetPercentage',100,'dimensionValue','broad'))),
          jsonb_build_object('id','q1-tt-us-conv','name','Conversion','funnelStage','conversion',
            'objective','CONVERSIONS','optimizationGoal','CONVERT',
            'budgetPercentage',50,'budgetType','daily',
            'startDate','2026-02-22','endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-tt-2','name','Retargeting','budgetPercentage',100,'dimensionValue','retarget')))
        )
      ),
      jsonb_build_object(
        'id','q1-tt-de','name','Germany','budgetPercentage',30,
        'adAccountId','sample_tt_445566','accountName','[Sample] D-squad — TikTok DE',
        'tiktokPixel','sample_tt_pixel_de','countries', jsonb_build_array('DE'),
        'ageMin',18,'ageMax',40,'gender','all','adFormats', jsonb_build_array('In-Feed ads'),
        'strategy','awareness','strategyFocus','awareness',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-tt-de-aw','name','Awareness','funnelStage','awareness',
            'objective','REACH','optimizationGoal','REACH',
            'budgetPercentage',100,'budgetType','daily',
            'startDate',v_q1_start,'endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-tt-de-1','name','Broad DE','budgetPercentage',100,'dimensionValue','broad')))
        )
      )
    ),
    'google', jsonb_build_array(
      jsonb_build_object(
        'id','q1-g-us','name','United States','budgetPercentage',65,
        'adAccountId','sample_gads_345678','accountName','[Sample] D-squad — Google Ads US',
        'countries', jsonb_build_array('US'),'strategy','full_funnel','strategyFocus','search',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-g-us-brand','name','Search - Brand','funnelStage','conversion',
            'objective','SALES','optimizationGoal','CONVERSIONS',
            'budgetPercentage',50,'budgetType','daily',
            'startDate',v_q1_start,'endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-g-1','name','Brand Keywords','budgetPercentage',100,'dimensionValue','brand'))),
          jsonb_build_object('id','q1-g-us-pmax','name','Performance Max','funnelStage','conversion',
            'objective','SALES','optimizationGoal','CONVERSIONS',
            'budgetPercentage',50,'budgetType','daily',
            'startDate',v_q1_start,'endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-g-2','name','PMax Asset Group','budgetPercentage',100,'dimensionValue','pmax')))
        )
      ),
      jsonb_build_object(
        'id','q1-g-uk','name','United Kingdom','budgetPercentage',35,
        'adAccountId','sample_gads_998877','accountName','[Sample] D-squad — Google Ads EU',
        'countries', jsonb_build_array('GB'),'strategy','awareness','strategyFocus','search',
        'phases', jsonb_build_array(
          jsonb_build_object('id','q1-g-uk-brand','name','Search - Brand','funnelStage','conversion',
            'objective','SALES','optimizationGoal','CONVERSIONS',
            'budgetPercentage',100,'budgetType','daily',
            'startDate',v_q1_start,'endDate',v_q1_end,
            'adSets', jsonb_build_array(jsonb_build_object('id','q1-as-g-uk-1','name','Brand UK','budgetPercentage',100,'dimensionValue','brand')))
        )
      )
    )
  );

  UPDATE public.campaigns
  SET market_splits = v_splits
  WHERE is_sample = true
    AND user_id = v_user_id
    AND name = '🎓 [Demo] Q1 2026 Cross-Platform Campaign';
END $$;