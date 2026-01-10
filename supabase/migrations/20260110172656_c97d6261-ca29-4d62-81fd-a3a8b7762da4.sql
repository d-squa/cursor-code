-- Enable realtime payload completeness for UPDATE events
ALTER TABLE public.creative_assignments REPLICA IDENTITY FULL;

-- Ensure table is in the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'creative_assignments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_assignments';
  END IF;
END$$;
