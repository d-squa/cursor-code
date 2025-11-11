-- Add status_history tracking to modification_requests
ALTER TABLE public.modification_requests 
ADD COLUMN IF NOT EXISTS status_history jsonb DEFAULT '[]'::jsonb;

-- Add function to update status_history when status changes
CREATE OR REPLACE FUNCTION public.track_modification_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_history = COALESCE(OLD.status_history, '[]'::jsonb) || 
      jsonb_build_object(
        'status', NEW.status,
        'changed_at', now(),
        'changed_by', auth.uid()
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for status changes
DROP TRIGGER IF EXISTS track_modification_status ON public.modification_requests;
CREATE TRIGGER track_modification_status
  BEFORE UPDATE ON public.modification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.track_modification_status_change();

-- Add published_at field to campaigns to track when they go live
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

-- Track initial status in status_history for existing records
UPDATE public.modification_requests
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', created_at,
    'changed_by', requester_id
  )
)
WHERE status_history = '[]'::jsonb OR status_history IS NULL;