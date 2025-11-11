-- Fix search path for the status change tracking function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;