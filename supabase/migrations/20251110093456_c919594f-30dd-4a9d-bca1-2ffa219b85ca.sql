-- Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Add team_id to user_roles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_roles' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_team_unique UNIQUE (user_id, team_id);
  END IF;
END $$;

-- Create RLS policies for teams
DROP POLICY IF EXISTS "Users can view teams they are members of" ON public.teams;
CREATE POLICY "Users can view teams they are members of"
  ON public.teams FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.team_id = teams.id
      AND user_roles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update teams" ON public.teams;
CREATE POLICY "Owners and admins can update teams"
  ON public.teams FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.team_id = teams.id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete teams" ON public.teams;
CREATE POLICY "Owners can delete teams"
  ON public.teams FOR DELETE
  USING (owner_id = auth.uid());

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
