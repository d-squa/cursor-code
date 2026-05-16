-- Approval recipients: exact same roster as Settings → Manage Your Team (Teams.tsx).

CREATE OR REPLACE FUNCTION public.get_team_approval_recipients(p_team_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_view_roles_in_team(auth.uid(), p_team_id) THEN
    RAISE EXCEPTION 'not authorized for this team' USING ERRCODE = '42501';
  END IF;

  SELECT t.owner_id INTO v_owner_id
  FROM public.teams t
  WHERE t.id = p_team_id;

  RETURN QUERY
  WITH visible AS (
    SELECT ur.user_id AS uid
    FROM public.user_roles ur
    WHERE ur.team_id = p_team_id
    UNION
    SELECT v_owner_id AS uid
    WHERE v_owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur2
        WHERE ur2.team_id = p_team_id
          AND ur2.user_id = v_owner_id
      )
  )
  SELECT
    v.uid AS user_id,
    p.email,
    COALESCE(NULLIF(TRIM(p.company_name), ''), p.email) AS display_label
  FROM visible v
  INNER JOIN public.profiles p ON p.id = v.uid
  WHERE v.uid IS DISTINCT FROM auth.uid()
  ORDER BY display_label;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_approval_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_approval_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_approval_recipients(uuid) TO service_role;

COMMENT ON FUNCTION public.get_team_approval_recipients(uuid) IS
  'Manage Your Team roster for p_team_id (user_roles + owner without role row), excluding caller.';
