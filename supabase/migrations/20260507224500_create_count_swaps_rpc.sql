CREATE TABLE IF NOT EXISTS public.ad_account_swap_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  platform text NOT NULL,
  previous_account_id text NOT NULL,
  new_account_id text NOT NULL,
  swap_type text NOT NULL DEFAULT 'swap',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_account_swap_logs
ADD COLUMN IF NOT EXISTS team_id uuid NULL REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ad_account_swap_logs_user_platform_date
  ON public.ad_account_swap_logs (user_id, platform, created_at);

CREATE INDEX IF NOT EXISTS idx_ad_account_swap_logs_team_id
  ON public.ad_account_swap_logs (team_id);

CREATE OR REPLACE FUNCTION public.count_swaps_in_billing_period(
  _user_id uuid,
  _platform text,
  _team_id uuid DEFAULT NULL,
  _billing_anchor_date timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period_start timestamptz;
  _anchor_day integer;
  _current_month_anchor timestamptz;
  _swap_count integer;
BEGIN
  IF _billing_anchor_date IS NULL THEN
    _period_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  ELSE
    _anchor_day := EXTRACT(DAY FROM _billing_anchor_date);
    BEGIN
      _current_month_anchor := date_trunc('month', now() AT TIME ZONE 'UTC') + ((_anchor_day - 1) || ' days')::interval;
    EXCEPTION WHEN OTHERS THEN
      _current_month_anchor := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month' - interval '1 day')::date::timestamptz;
    END;

    IF now() AT TIME ZONE 'UTC' < _current_month_anchor THEN
      BEGIN
        _period_start := date_trunc('month', now() AT TIME ZONE 'UTC' - interval '1 month') + ((_anchor_day - 1) || ' days')::interval;
      EXCEPTION WHEN OTHERS THEN
        _period_start := (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 day')::date::timestamptz;
      END;
    ELSE
      _period_start := _current_month_anchor;
    END IF;
  END IF;

  SELECT COUNT(*)::integer INTO _swap_count
  FROM public.ad_account_swap_logs
  WHERE platform = _platform
    AND swap_type = 'swap'
    AND created_at >= _period_start
    AND (
      (_team_id IS NOT NULL AND team_id = _team_id)
      OR (_team_id IS NULL AND user_id = _user_id)
    );

  RETURN COALESCE(_swap_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_swaps_in_billing_period(uuid, text, uuid, timestamptz) TO authenticated;
