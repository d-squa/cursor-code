-- Edge functions upsert with
-- onConflict: user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end
-- PostgREST returns 400 if no UNIQUE on exactly those columns (e.g. legacy 5-col unique only).
-- NULLS NOT DISTINCT so rows with industry IS NULL still conflict for upsert.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'campaign_performance_benchmarks'
      AND c.contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.campaign_performance_benchmarks DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

DELETE FROM public.campaign_performance_benchmarks a
USING (
  SELECT ctid
  FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY user_id,
               platform,
               market,
               optimization_goal,
               COALESCE(industry, ''),
               date_range_start,
               date_range_end
             ORDER BY updated_at DESC NULLS LAST, ctid DESC
           ) AS rn
    FROM public.campaign_performance_benchmarks
  ) ranked
  WHERE ranked.rn > 1
) d
WHERE a.ctid = d.ctid;

ALTER TABLE public.campaign_performance_benchmarks
  ADD CONSTRAINT campaign_performance_benchmarks_unique_key
  UNIQUE NULLS NOT DISTINCT (
    user_id,
    platform,
    market,
    optimization_goal,
    industry,
    date_range_start,
    date_range_end
  );
