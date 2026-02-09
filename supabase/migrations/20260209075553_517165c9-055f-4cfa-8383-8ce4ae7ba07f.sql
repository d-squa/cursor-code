-- Drop old function versions
DROP FUNCTION IF EXISTS public.count_swaps_this_month(uuid, text);
DROP FUNCTION IF EXISTS public.count_swaps_this_month(uuid, text, uuid);

-- Create new function that counts swaps within the current billing period
-- The billing period is determined by the subscription start date
-- If no subscription date provided, falls back to calendar month
CREATE OR REPLACE FUNCTION public.count_swaps_in_billing_period(
  _user_id UUID,
  _platform TEXT,
  _team_id UUID DEFAULT NULL,
  _billing_anchor_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period_start TIMESTAMPTZ;
  _anchor_day INTEGER;
  _current_month_anchor TIMESTAMPTZ;
  _swap_count INTEGER;
BEGIN
  -- If no billing anchor provided, use calendar month (1st of current month)
  IF _billing_anchor_date IS NULL THEN
    _period_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  ELSE
    -- Calculate the current billing period start based on the anchor date
    -- The anchor date is when the subscription started/renewed
    -- We need to find the most recent occurrence of that day-of-month
    _anchor_day := EXTRACT(DAY FROM _billing_anchor_date);
    
    -- Try to create the anchor date in the current month
    BEGIN
      _current_month_anchor := date_trunc('month', now() AT TIME ZONE 'UTC') + ((_anchor_day - 1) || ' days')::INTERVAL;
    EXCEPTION WHEN OTHERS THEN
      -- If the day doesn't exist in this month (e.g., 31st in Feb), use last day of month
      _current_month_anchor := (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month' - INTERVAL '1 day')::DATE::TIMESTAMPTZ;
    END;
    
    -- If we're before the anchor day this month, the period started last month
    IF now() AT TIME ZONE 'UTC' < _current_month_anchor THEN
      BEGIN
        _period_start := date_trunc('month', now() AT TIME ZONE 'UTC' - INTERVAL '1 month') + ((_anchor_day - 1) || ' days')::INTERVAL;
      EXCEPTION WHEN OTHERS THEN
        -- Handle months with fewer days
        _period_start := (date_trunc('month', now() AT TIME ZONE 'UTC') - INTERVAL '1 day')::DATE::TIMESTAMPTZ;
      END;
    ELSE
      _period_start := _current_month_anchor;
    END IF;
  END IF;

  -- Count swaps since the period start
  SELECT COUNT(*)::INTEGER INTO _swap_count
  FROM public.ad_account_swap_logs
  WHERE platform = _platform
    AND swap_type = 'swap'
    AND created_at >= _period_start
    AND (
      -- If team_id provided, scope to team; otherwise scope to user
      (_team_id IS NOT NULL AND team_id = _team_id)
      OR (_team_id IS NULL AND user_id = _user_id)
    );

  RETURN COALESCE(_swap_count, 0);
END;
$$;

-- Create a backward-compatible version of the old function that calls the new one
CREATE OR REPLACE FUNCTION public.count_swaps_this_month(
  _user_id UUID,
  _platform TEXT,
  _team_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call the new function with NULL billing anchor (uses calendar month)
  RETURN public.count_swaps_in_billing_period(_user_id, _platform, _team_id, NULL);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.count_swaps_in_billing_period(UUID, TEXT, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_swaps_this_month(UUID, TEXT, UUID) TO authenticated;