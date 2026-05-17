-- BO numbers are unique per workspace (team), not globally.

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_bo_number_key;

DROP INDEX IF EXISTS public.campaigns_team_id_bo_number_key;
CREATE UNIQUE INDEX campaigns_team_id_bo_number_key
  ON public.campaigns (team_id, bo_number)
  WHERE bo_number IS NOT NULL AND team_id IS NOT NULL;

DROP INDEX IF EXISTS public.campaigns_bo_number_no_team_key;
CREATE UNIQUE INDEX campaigns_bo_number_no_team_key
  ON public.campaigns (bo_number)
  WHERE bo_number IS NOT NULL AND team_id IS NULL;
