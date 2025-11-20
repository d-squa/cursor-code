-- Create team_clients junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.team_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(team_id, client_id)
);

-- Enable RLS on team_clients
ALTER TABLE public.team_clients ENABLE ROW LEVEL SECURITY;

-- Team members can view team-client relationships for their teams
CREATE POLICY "Team members can view their team clients"
ON public.team_clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = team_clients.team_id
    AND user_roles.user_id = auth.uid()
  )
);

-- Admins and team owners can manage team-client relationships
CREATE POLICY "Admins and team owners can manage team clients"
ON public.team_clients
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.teams
    WHERE teams.id = team_clients.team_id
    AND teams.owner_id = auth.uid()
  )
);

-- Update clients RLS policies to be subscription-based (user-based, not team-based)
-- Admins can manage all clients
CREATE POLICY "Admins can manage all clients"
ON public.clients
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Update existing policies to allow team members to view clients assigned to their teams
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
CREATE POLICY "Users can view their own clients or team clients"
ON public.clients
FOR SELECT
USING (
  auth.uid() = user_id OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.team_clients tc
    JOIN public.user_roles ur ON ur.team_id = tc.team_id
    WHERE tc.client_id = clients.id
    AND ur.user_id = auth.uid()
  )
);