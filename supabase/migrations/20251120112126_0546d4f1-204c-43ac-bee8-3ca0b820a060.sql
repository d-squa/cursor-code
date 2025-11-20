-- Add markets field to clients table
ALTER TABLE public.clients 
ADD COLUMN markets jsonb DEFAULT '[]'::jsonb;