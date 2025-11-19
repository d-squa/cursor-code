-- Add platforms field to clients table
ALTER TABLE clients ADD COLUMN platforms jsonb DEFAULT '[]'::jsonb;