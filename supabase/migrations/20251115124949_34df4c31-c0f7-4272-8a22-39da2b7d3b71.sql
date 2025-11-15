-- Fix function search_path security issue
-- Note: The has_role function signature is (_user_id uuid, _role app_role)
ALTER FUNCTION has_role(_user_id uuid, _role app_role) SET search_path = public, pg_temp;