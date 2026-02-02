-- Create table to store ActiPlan time tracking sessions
CREATE TABLE public.actiplan_time_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_end TIMESTAMP WITH TIME ZONE,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_actiplan_time_sessions_campaign ON public.actiplan_time_sessions(campaign_id);
CREATE INDEX idx_actiplan_time_sessions_user ON public.actiplan_time_sessions(user_id);
CREATE INDEX idx_actiplan_time_sessions_active ON public.actiplan_time_sessions(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.actiplan_time_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view time sessions for campaigns they have access to
CREATE POLICY "Users can view time sessions for accessible campaigns"
ON public.actiplan_time_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = actiplan_time_sessions.campaign_id
    AND (
      c.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.team_id = c.team_id
        AND ur.user_id = auth.uid()
      )
    )
  )
);

-- Users can create their own time sessions
CREATE POLICY "Users can create their own time sessions"
ON public.actiplan_time_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own active sessions
CREATE POLICY "Users can update their own time sessions"
ON public.actiplan_time_sessions
FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_actiplan_time_sessions_updated_at
BEFORE UPDATE ON public.actiplan_time_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();