-- Create table for client-specific operation time defaults
CREATE TABLE public.client_operation_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL, -- 'change_request' or 'logged_action'
  operation_subtype TEXT NOT NULL, -- e.g., 'Budget Adjustment', 'Targeting Change', etc.
  estimated_hours NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, operation_type, operation_subtype)
);

-- Enable RLS
ALTER TABLE public.client_operation_defaults ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can manage, but team members can view
CREATE POLICY "Admins can manage operation defaults"
ON public.client_operation_defaults
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Team members can view operation defaults"
ON public.client_operation_defaults
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_operation_defaults.client_id
    AND (c.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- Add completion tracking fields to modification_requests
ALTER TABLE public.modification_requests
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Add time tracking fields to activity_logs
ALTER TABLE public.activity_logs
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(5,2);

-- Create index for performance
CREATE INDEX idx_client_operation_defaults_client ON public.client_operation_defaults(client_id);
CREATE INDEX idx_modification_requests_completed_by ON public.modification_requests(completed_by);
CREATE INDEX idx_modification_requests_completed_at ON public.modification_requests(completed_at);

-- Add trigger for updated_at
CREATE TRIGGER update_client_operation_defaults_updated_at
BEFORE UPDATE ON public.client_operation_defaults
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();