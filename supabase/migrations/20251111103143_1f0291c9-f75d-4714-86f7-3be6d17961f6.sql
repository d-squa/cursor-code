-- Create invitations table for managing user invites
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins and team owners can view invitations
CREATE POLICY "Team owners and admins can view invitations"
ON public.invitations
FOR SELECT
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.teams 
    WHERE teams.id = invitations.team_id 
    AND teams.owner_id = auth.uid()
  )
);

-- Admins and team owners can create invitations
CREATE POLICY "Team owners and admins can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  created_by = auth.uid() 
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.teams 
      WHERE teams.id = invitations.team_id 
      AND teams.owner_id = auth.uid()
    )
  )
);

-- Admins and creators can update invitations
CREATE POLICY "Creators and admins can update invitations"
ON public.invitations
FOR UPDATE
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Admins and creators can delete invitations
CREATE POLICY "Creators and admins can delete invitations"
ON public.invitations
FOR DELETE
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Create index for faster token lookups
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_invitations_status ON public.invitations(status);