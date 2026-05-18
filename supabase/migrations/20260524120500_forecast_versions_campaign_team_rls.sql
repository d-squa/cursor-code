-- forecast_versions are keyed by (campaign_id, version_number) but RLS previously
-- scoped SELECT to user_id = auth.uid(), so teammates could not see existing
-- versions and inserts collided on version_number (23505).

DROP POLICY IF EXISTS "Users can view their forecast versions" ON public.forecast_versions;
DROP POLICY IF EXISTS "Users can insert their forecast versions" ON public.forecast_versions;
DROP POLICY IF EXISTS "Users can delete their forecast versions" ON public.forecast_versions;

CREATE POLICY "Users can view forecast versions for accessible campaigns"
  ON public.forecast_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = forecast_versions.campaign_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.team_id = c.team_id
              AND ur.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Users can insert forecast versions for editable campaigns"
  ON public.forecast_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = forecast_versions.campaign_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.team_id = c.team_id
              AND ur.user_id = auth.uid()
              AND ur.role IN (
                'admin'::public.app_role,
                'owner'::public.app_role,
                'campaign_manager'::public.app_role,
                'member'::public.app_role
              )
          )
        )
    )
  );

CREATE POLICY "Users can delete forecast versions for editable campaigns"
  ON public.forecast_versions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = forecast_versions.campaign_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.team_id = c.team_id
              AND ur.user_id = auth.uid()
              AND ur.role IN (
                'admin'::public.app_role,
                'owner'::public.app_role,
                'campaign_manager'::public.app_role
              )
          )
        )
    )
  );
