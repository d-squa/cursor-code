-- Create modification requests table
CREATE TABLE IF NOT EXISTS public.modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  assigned_to UUID[] DEFAULT '{}',
  notify_all_team BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create campaign change history table
CREATE TABLE IF NOT EXISTS public.campaign_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  change_type TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.modification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_change_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for modification_requests
CREATE POLICY "Users can view modification requests for their campaigns"
ON public.modification_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = modification_requests.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  OR requester_id = auth.uid()
  OR auth.uid() = ANY(assigned_to)
);

CREATE POLICY "Users can create modification requests"
ON public.modification_requests FOR INSERT
TO authenticated
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Campaign owners and assignees can update modification requests"
ON public.modification_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = modification_requests.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  OR auth.uid() = ANY(assigned_to)
);

-- RLS Policies for campaign_change_history
CREATE POLICY "Users can view history for their campaigns"
ON public.campaign_change_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_change_history.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create history entries"
ON public.campaign_change_history FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Create updated_at trigger
CREATE TRIGGER update_modification_requests_updated_at
BEFORE UPDATE ON public.modification_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();