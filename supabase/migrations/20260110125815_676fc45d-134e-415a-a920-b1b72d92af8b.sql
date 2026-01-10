-- Enable realtime for creative_assignments table
ALTER TABLE public.creative_assignments REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_assignments;