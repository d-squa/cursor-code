-- Create request_comments table for task management comments
CREATE TABLE public.request_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.modification_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

-- Users can view comments on requests they have access to (assigned to them, or they requested, or they are team admin)
CREATE POLICY "Users can view comments on accessible requests"
ON public.request_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM modification_requests mr
    JOIN campaigns c ON c.id = mr.campaign_id
    WHERE mr.id = request_comments.request_id
    AND (
      -- User is assigned to the request
      auth.uid() = ANY(mr.assigned_to)
      -- User is the requester
      OR mr.requester_id = auth.uid()
      -- User is notified via notify_all_team and is in the team
      OR (mr.notify_all_team = true AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
      ))
      -- User is admin/owner of the team
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.team_id = c.team_id 
        AND ur.user_id = auth.uid() 
        AND ur.role IN ('admin', 'owner')
      )
    )
  )
);

-- Users can insert comments on requests they have access to
CREATE POLICY "Users can add comments to accessible requests"
ON public.request_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM modification_requests mr
    JOIN campaigns c ON c.id = mr.campaign_id
    WHERE mr.id = request_comments.request_id
    AND (
      auth.uid() = ANY(mr.assigned_to)
      OR mr.requester_id = auth.uid()
      OR (mr.notify_all_team = true AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.team_id = c.team_id 
        AND ur.user_id = auth.uid() 
        AND ur.role IN ('admin', 'owner')
      )
    )
  )
);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
ON public.request_comments
FOR DELETE
USING (auth.uid() = user_id);