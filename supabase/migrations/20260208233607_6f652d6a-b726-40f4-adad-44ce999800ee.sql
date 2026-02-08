-- Add team_id to ad_account_swap_logs for workspace scoping
ALTER TABLE public.ad_account_swap_logs 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

-- Add index for team-based queries
CREATE INDEX IF NOT EXISTS idx_ad_account_swap_logs_team_id ON public.ad_account_swap_logs(team_id);

-- Add metadata column to store additional context (account names, etc.)
ALTER TABLE public.ad_account_swap_logs 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Update the count_swaps_this_month function to support team-based counting
CREATE OR REPLACE FUNCTION public.count_swaps_this_month(_user_id uuid, _platform text, _team_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.ad_account_swap_logs
  WHERE platform = _platform
    AND swap_type = 'swap'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
    AND (
      -- If team_id provided, scope to team; otherwise scope to user
      (_team_id IS NOT NULL AND team_id = _team_id)
      OR (_team_id IS NULL AND user_id = _user_id)
    )
$$;

-- Create RLS policies for swap logs (admins/owners can view team swap logs)
DROP POLICY IF EXISTS "Users can view their own swap logs" ON public.ad_account_swap_logs;
DROP POLICY IF EXISTS "Team admins can view team swap logs" ON public.ad_account_swap_logs;
DROP POLICY IF EXISTS "Users can insert their own swap logs" ON public.ad_account_swap_logs;

CREATE POLICY "Users can view their own swap logs"
ON public.ad_account_swap_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Team admins can view team swap logs"
ON public.ad_account_swap_logs
FOR SELECT
USING (
  team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.team_id = ad_account_swap_logs.team_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Users can insert their own swap logs"
ON public.ad_account_swap_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Enable RLS if not already enabled
ALTER TABLE public.ad_account_swap_logs ENABLE ROW LEVEL SECURITY;