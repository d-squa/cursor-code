CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count integer;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  
  -- Check if this is the first user
  SELECT COUNT(*) INTO user_count FROM public.profiles WHERE id != new.id;
  
  -- First user gets owner role, others get campaign_manager
  IF user_count = 0 THEN
    assigned_role := 'owner';
  ELSE
    assigned_role := 'campaign_manager';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, assigned_role);
  
  RETURN new;
END;
$$;