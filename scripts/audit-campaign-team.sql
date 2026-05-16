-- Run in Supabase SQL Editor for campaign ad9e1040-bc51-4a7e-b79a-a320db766226

SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  c.team_id AS saved_team_id,
  t.name AS saved_team_name,
  t.is_default AS saved_team_is_default,
  w.id AS billing_workspace_id,
  w.name AS billing_workspace_name
FROM public.campaigns c
LEFT JOIN public.teams t ON t.id = c.team_id
LEFT JOIN public.workspaces w ON w.id = t.workspace_id
WHERE c.id = 'ad9e1040-bc51-4a7e-b79a-a320db766226';

SELECT
  ur.user_id,
  p.email,
  ur.role,
  t.name AS team_name
FROM public.user_roles ur
JOIN public.teams t ON t.id = ur.team_id
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.team_id = (
  SELECT team_id FROM public.campaigns WHERE id = 'ad9e1040-bc51-4a7e-b79a-a320db766226'
)
ORDER BY p.email;

SELECT
  t.id AS team_id,
  t.name AS team_name,
  COUNT(ur.user_id) AS role_row_count
FROM public.teams t
LEFT JOIN public.user_roles ur ON ur.team_id = t.id
WHERE t.workspace_id = (
  SELECT t2.workspace_id
  FROM public.campaigns c
  JOIN public.teams t2 ON t2.id = c.team_id
  WHERE c.id = 'ad9e1040-bc51-4a7e-b79a-a320db766226'
)
GROUP BY t.id, t.name
ORDER BY t.name;
