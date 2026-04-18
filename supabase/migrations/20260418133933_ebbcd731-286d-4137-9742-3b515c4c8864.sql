-- 1) Make sample campaign visible on Overview by setting status to 'live'
UPDATE public.campaigns
SET status = 'live',
    updated_at = now()
WHERE id = '3d42526c-4aa3-416d-ae8c-0e84bc129c1b'
  AND is_sample = true;

-- 2) Pre-fill an Insights & Recommendations analysis for the sample campaign,
--    so the tour step shows real content rather than an empty state.
INSERT INTO public.saved_insights_analyses (
  user_id, campaign_id, campaign_name, platforms, breakdowns,
  time_comparison, analysis_result, raw_data, created_at
)
SELECT
  c.user_id,
  c.id,
  c.name,
  ARRAY['meta','tiktok','google_ads'],
  ARRAY['platform','market','phase'],
  'last_14_days',
  $$# Cross-Platform Performance Analysis — Last 14 Days vs Previous 14 Days

## 🚀 Executive Summary
The campaign is **overpacing by ~12%** mid-flight, driven primarily by **Meta** (heavy overspend) and stable **TikTok** delivery. **Google Ads** is underpacing (-9%) but converting at the lowest CPA, suggesting a budget reallocation opportunity.

## 📊 Platform Highlights
- **Meta:** CTR up **+18%**, CPM up **+22%**. Strong creative fatigue signals on the Awareness phase — refresh recommended within 5 days.
- **TikTok:** Conversions up **+9%**, CPA down **-7%**. Spark Ads outperforming standard in-feed by **2.3×** ROAS.
- **Google Ads:** Search Brand on track; Performance Max underdelivering due to limited asset variety. Adding 3 video assets is projected to lift conversions by **~15%**.

## 🎯 Recommendations
1. **Shift 15% of Meta budget → Google PMax** to capture cheaper conversions.
2. **Pause 2 underperforming Meta ad sets** (CTR < 0.4%) and reallocate to top 3 winners.
3. **Add YouTube assets to Google PMax** for asset group completeness.
4. **Launch TikTok Spark Ads variant** mirroring top organic post engagement.

## ⚠️ Risks
- Meta frequency reaching **3.8** in DK market — creative fatigue risk.
- Google Ads daily budget capped 6 of last 14 days — increase by 20%.
$$,
  jsonb_build_object(
    'totals', jsonb_build_object('spend', 48230, 'impressions', 6420000, 'clicks', 92500, 'conversions', 3120),
    'platforms', jsonb_build_array(
      jsonb_build_object('platform','meta','spend',24500,'cpa',14.20,'roas',2.8,'pacing','+22%'),
      jsonb_build_object('platform','tiktok','spend',14800,'cpa',11.10,'roas',3.2,'pacing','+2%'),
      jsonb_build_object('platform','google_ads','spend',8930,'cpa',9.40,'roas',3.6,'pacing','-9%')
    )
  ),
  now() - interval '2 days'
FROM public.campaigns c
WHERE c.id = '3d42526c-4aa3-416d-ae8c-0e84bc129c1b'
  AND NOT EXISTS (
    SELECT 1 FROM public.saved_insights_analyses s
    WHERE s.campaign_id = c.id
  );