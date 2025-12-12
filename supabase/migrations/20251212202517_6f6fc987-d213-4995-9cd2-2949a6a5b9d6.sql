-- Fix store_platform_token function to properly handle vault secret creation
CREATE OR REPLACE FUNCTION public.store_platform_token(platform_id uuid, token_value text, token_type text DEFAULT 'access'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  secret_name text;
  existing_secret_id uuid;
BEGIN
  -- Only service role can call this
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF token_type = 'access' THEN
    secret_name := 'platform_access_token_' || platform_id::text;
  ELSIF token_type = 'refresh' THEN
    secret_name := 'platform_refresh_token_' || platform_id::text;
  ELSE
    RAISE EXCEPTION 'Invalid token type';
  END IF;
  
  -- Check if secret already exists
  SELECT id INTO existing_secret_id FROM vault.secrets WHERE name = secret_name;
  
  IF existing_secret_id IS NOT NULL THEN
    -- Update existing secret
    PERFORM vault.update_secret(existing_secret_id, token_value);
    RAISE NOTICE 'Updated existing vault secret: %', secret_name;
  ELSE
    -- Create new secret
    PERFORM vault.create_secret(token_value, secret_name);
    RAISE NOTICE 'Created new vault secret: %', secret_name;
  END IF;
END;
$function$;