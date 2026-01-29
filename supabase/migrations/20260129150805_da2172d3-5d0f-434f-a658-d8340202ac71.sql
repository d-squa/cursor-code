-- Create helper functions for Ad Library token storage in Vault
-- These use a user-scoped naming convention different from platform tokens

-- Function to store Ad Library token
CREATE OR REPLACE FUNCTION public.store_adlibrary_token(
  user_id_param uuid,
  token_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  existing_secret_id uuid;
BEGIN
  -- Only service role can call this
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  secret_name := 'adlibrary_user_token_' || user_id_param::text;
  
  -- Check if secret already exists
  SELECT id INTO existing_secret_id FROM vault.secrets WHERE name = secret_name;
  
  IF existing_secret_id IS NOT NULL THEN
    -- Update existing secret
    PERFORM vault.update_secret(existing_secret_id, token_value);
    RAISE NOTICE 'Updated existing Ad Library vault secret: %', secret_name;
  ELSE
    -- Create new secret
    PERFORM vault.create_secret(token_value, secret_name);
    RAISE NOTICE 'Created new Ad Library vault secret: %', secret_name;
  END IF;
END;
$$;

-- Function to retrieve Ad Library token
CREATE OR REPLACE FUNCTION public.get_adlibrary_token(
  user_id_param uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  secret_value text;
BEGIN
  -- Only service role can call this
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  secret_name := 'adlibrary_user_token_' || user_id_param::text;
  
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN secret_value;
END;
$$;

-- Add column to profiles to track Ad Library authorization status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS adlibrary_authorized boolean DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS adlibrary_authorized_at timestamp with time zone;