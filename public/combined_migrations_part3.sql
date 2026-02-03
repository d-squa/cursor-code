-- =====================================================
-- COMBINED MIGRATIONS PART 3 - Features & Creative Library
-- SAFE TO RE-RUN: Uses IF NOT EXISTS and DROP IF EXISTS
-- =====================================================

-- =====================================================
-- TikTok Apps table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tiktok_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  advertiser_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_type TEXT,
  download_url TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.tiktok_apps ADD CONSTRAINT tiktok_apps_unique UNIQUE(user_id, advertiser_id, app_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.tiktok_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own TikTok apps" ON public.tiktok_apps;
CREATE POLICY "Users can view their own TikTok apps" 
ON public.tiktok_apps FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own TikTok apps" ON public.tiktok_apps;
CREATE POLICY "Users can insert their own TikTok apps" 
ON public.tiktok_apps FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own TikTok apps" ON public.tiktok_apps;
CREATE POLICY "Users can update their own TikTok apps" 
ON public.tiktok_apps FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own TikTok apps" ON public.tiktok_apps;
CREATE POLICY "Users can delete their own TikTok apps" 
ON public.tiktok_apps FOR DELETE 
USING (auth.uid() = user_id);

-- =====================================================
-- Campaign Launch Status table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.campaign_launch_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  market TEXT NOT NULL,
  phase_name TEXT,
  entity_type TEXT NOT NULL,
  entity_name TEXT,
  dsp_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  error_details JSONB,
  planned_budget NUMERIC,
  planned_impressions NUMERIC,
  planned_reach NUMERIC,
  planned_clicks NUMERIC,
  planned_conversions NUMERIC,
  dsp_status TEXT,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.campaign_launch_status ADD CONSTRAINT campaign_launch_status_entity_type_check 
    CHECK (entity_type IN ('campaign', 'adset', 'ad_group'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.campaign_launch_status ADD CONSTRAINT campaign_launch_status_status_check 
    CHECK (status IN ('pending_validation', 'validation_error', 'ready_for_push', 'pushing', 'pushed_to_dsp', 'push_failed', 'live', 'paused', 'pending'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaign_launch_status_campaign_id ON public.campaign_launch_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_launch_status_status ON public.campaign_launch_status(status);

ALTER TABLE public.campaign_launch_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign launch statuses" ON public.campaign_launch_status;
CREATE POLICY "Users can view campaign launch statuses"
ON public.campaign_launch_status
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND (
      c.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.team_id = c.team_id
        AND ur.user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can insert campaign launch statuses" ON public.campaign_launch_status;
CREATE POLICY "Users can insert campaign launch statuses"
ON public.campaign_launch_status
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND (
      c.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.team_id = c.team_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'owner', 'campaign_manager', 'member')
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can update campaign launch statuses" ON public.campaign_launch_status;
CREATE POLICY "Users can update campaign launch statuses"
ON public.campaign_launch_status
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND (
      c.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.team_id = c.team_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'owner', 'campaign_manager', 'member')
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can delete campaign launch statuses" ON public.campaign_launch_status;
CREATE POLICY "Users can delete campaign launch statuses"
ON public.campaign_launch_status
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_launch_status.campaign_id
    AND (
      c.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.team_id = c.team_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'owner', 'campaign_manager')
      )
    )
  )
);

DROP TRIGGER IF EXISTS update_campaign_launch_status_updated_at ON public.campaign_launch_status;
CREATE TRIGGER update_campaign_launch_status_updated_at
BEFORE UPDATE ON public.campaign_launch_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Profile onboarding fields
-- =====================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS role text,
ADD COLUMN IF NOT EXISTS team_size text,
ADD COLUMN IF NOT EXISTS discovery_source text,
ADD COLUMN IF NOT EXISTS paid_media_experience text,
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS adlibrary_authorized boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS adlibrary_authorized_at timestamp with time zone;

-- =====================================================
-- Vault token functions
-- =====================================================

CREATE OR REPLACE FUNCTION public.store_platform_token(platform_id uuid, token_value text, token_type text DEFAULT 'access'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  existing_secret_id uuid;
BEGIN
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
  
  SELECT id INTO existing_secret_id FROM vault.secrets WHERE name = secret_name;
  
  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_secret_id, token_value);
  ELSE
    PERFORM vault.create_secret(token_value, secret_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_token(platform_id uuid, token_type text DEFAULT 'access'::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  secret_value text;
BEGIN
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
  
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN secret_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_adlibrary_token(user_id_param uuid, token_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  existing_secret_id uuid;
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  secret_name := 'adlibrary_user_token_' || user_id_param::text;
  
  SELECT id INTO existing_secret_id FROM vault.secrets WHERE name = secret_name;
  
  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_secret_id, token_value);
  ELSE
    PERFORM vault.create_secret(token_value, secret_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_adlibrary_token(user_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  secret_name text;
  secret_value text;
BEGIN
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

-- =====================================================
-- Saved insights analyses
-- =====================================================

CREATE TABLE IF NOT EXISTS public.saved_insights_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  breakdowns TEXT[] NOT NULL DEFAULT '{}',
  time_comparison TEXT NOT NULL,
  analysis_result TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_insights_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved analyses" ON public.saved_insights_analyses;
CREATE POLICY "Users can view their own saved analyses" 
ON public.saved_insights_analyses 
FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own saved analyses" ON public.saved_insights_analyses;
CREATE POLICY "Users can create their own saved analyses" 
ON public.saved_insights_analyses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved analyses" ON public.saved_insights_analyses;
CREATE POLICY "Users can delete their own saved analyses" 
ON public.saved_insights_analyses 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_insights_user_id ON public.saved_insights_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_insights_created_at ON public.saved_insights_analyses(created_at DESC);

-- =====================================================
-- Activity logs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  affected_platforms TEXT[] DEFAULT '{}',
  affected_markets TEXT[] DEFAULT '{}',
  affected_phases TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  estimated_hours NUMERIC(5,2),
  actual_hours NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_action_type_check 
    CHECK (action_type IN ('budget_adjustment', 'targeting_change', 'creative_update', 'pause_resume', 'note'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view activity logs for their campaigns" ON public.activity_logs;
CREATE POLICY "Users can view activity logs for their campaigns"
ON public.activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = activity_logs.campaign_id
    AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Users can create activity logs for accessible campaigns" ON public.activity_logs;
CREATE POLICY "Users can create activity logs for accessible campaigns"
ON public.activity_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = activity_logs.campaign_id
    AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Users can update their own activity logs" ON public.activity_logs;
CREATE POLICY "Users can update their own activity logs"
ON public.activity_logs
FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_logs;
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_logs
FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_activity_logs_campaign_id ON public.activity_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- =====================================================
-- Competitor tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.competitor_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  competitor_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  market TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false,
  active_ad_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ad_details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.competitor_tracking ADD CONSTRAINT unique_competitor_per_client_platform_market 
    UNIQUE (client_id, competitor_name, platform, market);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.competitor_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_tracking_id UUID REFERENCES public.competitor_tracking(id) ON DELETE CASCADE,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  was_live BOOLEAN NOT NULL,
  ad_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own competitor tracking" ON public.competitor_tracking;
CREATE POLICY "Users can view their own competitor tracking"
  ON public.competitor_tracking FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own competitor tracking" ON public.competitor_tracking;
CREATE POLICY "Users can insert their own competitor tracking"
  ON public.competitor_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own competitor tracking" ON public.competitor_tracking;
CREATE POLICY "Users can update their own competitor tracking"
  ON public.competitor_tracking FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own competitor tracking" ON public.competitor_tracking;
CREATE POLICY "Users can delete their own competitor tracking"
  ON public.competitor_tracking FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their competitor history" ON public.competitor_history;
CREATE POLICY "Users can view their competitor history"
  ON public.competitor_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.competitor_tracking ct 
    WHERE ct.id = competitor_history.competitor_tracking_id 
    AND ct.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert competitor history" ON public.competitor_history;
CREATE POLICY "Users can insert competitor history"
  ON public.competitor_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.competitor_tracking ct 
    WHERE ct.id = competitor_history.competitor_tracking_id 
    AND ct.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_competitor_tracking_client ON public.competitor_tracking(client_id);
CREATE INDEX IF NOT EXISTS idx_competitor_tracking_user ON public.competitor_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_tracking_platform_market ON public.competitor_tracking(platform, market);
CREATE INDEX IF NOT EXISTS idx_competitor_history_tracking ON public.competitor_history(competitor_tracking_id);
CREATE INDEX IF NOT EXISTS idx_competitor_history_checked ON public.competitor_history(checked_at);

DROP TRIGGER IF EXISTS update_competitor_tracking_updated_at ON public.competitor_tracking;
CREATE TRIGGER update_competitor_tracking_updated_at
  BEFORE UPDATE ON public.competitor_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Client operation defaults
-- =====================================================

CREATE TABLE IF NOT EXISTS public.client_operation_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  operation_subtype TEXT NOT NULL,
  estimated_hours NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.client_operation_defaults ADD CONSTRAINT client_operation_defaults_unique 
    UNIQUE(client_id, operation_type, operation_subtype);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.client_operation_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team leads can manage operation defaults" ON client_operation_defaults;
CREATE POLICY "Team leads can manage operation defaults"
ON client_operation_defaults
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'campaign_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'campaign_manager'::app_role)
);

DROP POLICY IF EXISTS "Team members can view operation defaults" ON public.client_operation_defaults;
CREATE POLICY "Team members can view operation defaults"
ON public.client_operation_defaults
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_operation_defaults.client_id
    AND (c.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

ALTER TABLE public.modification_requests
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_client_operation_defaults_client ON public.client_operation_defaults(client_id);
CREATE INDEX IF NOT EXISTS idx_modification_requests_completed_by ON public.modification_requests(completed_by);
CREATE INDEX IF NOT EXISTS idx_modification_requests_completed_at ON public.modification_requests(completed_at);

DROP TRIGGER IF EXISTS update_client_operation_defaults_updated_at ON public.client_operation_defaults;
CREATE TRIGGER update_client_operation_defaults_updated_at
BEFORE UPDATE ON public.client_operation_defaults
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- User workspace and role functions
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.teams WHERE owner_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_team_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_highest_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY 
    CASE role 
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'campaign_manager' THEN 3
      WHEN 'collaborator' THEN 4
      WHEN 'member' THEN 5
      WHEN 'viewer' THEN 6
      ELSE 7
    END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid uuid;
  email text;
  existing_team_id uuid;
  base_name text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  email := auth.jwt() ->> 'email';

  INSERT INTO public.profiles (id, email)
  VALUES (uid, COALESCE(email, ''))
  ON CONFLICT (id)
  DO UPDATE SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  SELECT t.id
  INTO existing_team_id
  FROM public.teams t
  WHERE t.owner_id = uid
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF existing_team_id IS NULL THEN
    base_name := NULLIF(split_part(COALESCE(email, ''), '@', 1), '');

    INSERT INTO public.teams (name, owner_id, description)
    VALUES (
      COALESCE(base_name, 'My') || '''s Workspace',
      uid,
      'Personal workspace'
    )
    RETURNING id INTO existing_team_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND ur.team_id = existing_team_id
      AND ur.role = 'owner'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role, team_id)
    VALUES (uid, 'owner'::public.app_role, existing_team_id);
  END IF;

  RETURN existing_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_workspace() TO authenticated;

-- =====================================================
-- Billing customers
-- =====================================================

CREATE TABLE IF NOT EXISTS public.billing_customers (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

DO $$ BEGIN
  ALTER TABLE public.billing_customers ADD CONSTRAINT billing_customers_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.billing_customers ADD CONSTRAINT billing_customers_stripe_customer_id_key UNIQUE (stripe_customer_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS billing_customers_email_idx on public.billing_customers (email);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their billing customer mapping" ON public.billing_customers;
CREATE POLICY "Users can view their billing customer mapping"
on public.billing_customers
for select
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can insert billing customers" ON public.billing_customers;
CREATE POLICY "Service role can insert billing customers"
ON public.billing_customers
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can update billing customers" ON public.billing_customers;
CREATE POLICY "Service role can update billing customers"
ON public.billing_customers
FOR UPDATE
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

DROP TRIGGER IF EXISTS update_billing_customers_updated_at ON public.billing_customers;
CREATE TRIGGER update_billing_customers_updated_at
before update on public.billing_customers
for each row execute function public.update_updated_at_column();

-- =====================================================
-- User sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_key UNIQUE(user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own session" ON public.user_sessions;
CREATE POLICY "Users can view their own session"
ON public.user_sessions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage sessions" ON public.user_sessions;
CREATE POLICY "Service role can manage sessions"
ON public.user_sessions
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- =====================================================
-- Request comments
-- =====================================================

CREATE TABLE IF NOT EXISTS public.request_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.modification_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view comments on accessible requests" ON public.request_comments;
CREATE POLICY "Users can view comments on accessible requests"
ON public.request_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM modification_requests mr
    JOIN campaigns c ON c.id = mr.campaign_id
    WHERE mr.id = request_comments.request_id
    AND (
      auth.uid() = ANY(mr.assigned_to)
      OR mr.requester_id = auth.uid()
      OR (mr.notify_all_team = true AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.team_id = c.team_id 
        AND ur.user_id = auth.uid() 
        AND ur.role IN ('admin', 'owner')
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can add comments to accessible requests" ON public.request_comments;
CREATE POLICY "Users can add comments to accessible requests"
ON public.request_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM modification_requests mr
    JOIN campaigns c ON c.id = mr.campaign_id
    WHERE mr.id = request_comments.request_id
    AND (
      auth.uid() = ANY(mr.assigned_to)
      OR mr.requester_id = auth.uid()
      OR (mr.notify_all_team = true AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.team_id = c.team_id AND ur.user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.team_id = c.team_id 
        AND ur.user_id = auth.uid() 
        AND ur.role IN ('admin', 'owner')
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.request_comments;
CREATE POLICY "Users can delete their own comments"
ON public.request_comments
FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- Creative import batches
-- =====================================================

CREATE TABLE IF NOT EXISTS public.creative_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL,
  source_filename TEXT,
  status TEXT DEFAULT 'pending',
  total_items INTEGER,
  successful_items INTEGER,
  failed_items INTEGER,
  error_log JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own import batches" ON public.creative_import_batches;
CREATE POLICY "Users can view their own import batches"
ON public.creative_import_batches FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own import batches" ON public.creative_import_batches;
CREATE POLICY "Users can create their own import batches"
ON public.creative_import_batches FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own import batches" ON public.creative_import_batches;
CREATE POLICY "Users can update their own import batches"
ON public.creative_import_batches FOR UPDATE
USING (auth.uid() = user_id);

-- =====================================================
-- Creative push jobs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.creative_push_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_assignments INTEGER DEFAULT 0,
  pushed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_push_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push jobs" ON public.creative_push_jobs;
CREATE POLICY "Users can view their own push jobs"
ON public.creative_push_jobs FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own push jobs" ON public.creative_push_jobs;
CREATE POLICY "Users can create their own push jobs"
ON public.creative_push_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own push jobs" ON public.creative_push_jobs;
CREATE POLICY "Users can update their own push jobs"
ON public.creative_push_jobs FOR UPDATE
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_creative_push_jobs_updated_at ON public.creative_push_jobs;
CREATE TRIGGER update_creative_push_jobs_updated_at
BEFORE UPDATE ON public.creative_push_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- END OF PART 3
-- =====================================================
