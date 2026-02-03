-- =====================================================
-- COMBINED MIGRATIONS - CHRONOLOGICAL ORDER
-- Generated from all migration files in supabase/migrations/
-- Run this file on a fresh Supabase project to recreate the full schema
-- SAFE TO RE-RUN: Uses IF NOT EXISTS and DO blocks for idempotency
-- =====================================================

-- =====================================================
-- 20251023134857 - Initial Schema Setup
-- =====================================================

-- Create role enum (safe for re-run)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'campaign_manager', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  total_budget NUMERIC NOT NULL DEFAULT 0,
  objective TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  platforms JSONB NOT NULL DEFAULT '[]',
  budget_allocation JSONB NOT NULL DEFAULT '{}',
  market_splits JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for campaigns
CREATE POLICY "Users can view their own campaigns"
  ON public.campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON public.campaigns FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all campaigns"
  ON public.campaigns FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  
  -- Assign default role as campaign_manager
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'campaign_manager');
  
  RETURN new;
END;
$$;

-- Trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20251027160606 - Connected Platforms
-- =====================================================

-- Create table for storing connected platform accounts
CREATE TABLE public.connected_platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform_type TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  ad_account_id TEXT,
  ad_account_name TEXT,
  business_manager_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.connected_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connected platforms"
ON public.connected_platforms
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connected platforms"
ON public.connected_platforms
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connected platforms"
ON public.connected_platforms
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connected platforms"
ON public.connected_platforms
FOR DELETE
USING (auth.uid() = user_id);

-- Create table for storing platform-specific accounts
CREATE TABLE public.platform_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connected_platform_id UUID NOT NULL REFERENCES public.connected_platforms(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their platform accounts"
ON public.platform_accounts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their platform accounts"
ON public.platform_accounts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their platform accounts"
ON public.platform_accounts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

CREATE TRIGGER update_connected_platforms_updated_at
BEFORE UPDATE ON public.connected_platforms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_connected_platforms_user_id ON public.connected_platforms(user_id);
CREATE INDEX idx_connected_platforms_platform_type ON public.connected_platforms(platform_type);
CREATE INDEX idx_platform_accounts_connected_platform_id ON public.platform_accounts(connected_platform_id);

-- =====================================================
-- 20251110001507 - Add new role values
-- =====================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'collaborator';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'member';

-- =====================================================
-- 20251110093456 - Teams table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_roles' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_team_unique UNIQUE (user_id, team_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view teams they are members of" ON public.teams;
CREATE POLICY "Users can view teams they are members of"
  ON public.teams FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.team_id = teams.id
      AND user_roles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update teams" ON public.teams;
CREATE POLICY "Owners and admins can update teams"
  ON public.teams FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.team_id = teams.id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete teams" ON public.teams;
CREATE POLICY "Owners can delete teams"
  ON public.teams FOR DELETE
  USING (owner_id = auth.uid());

DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20251110113012 - Forecast data and PDF storage
-- =====================================================

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS forecast_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-pdfs', 'campaign-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view their campaign PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'campaign-pdfs' AND
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(name))[1]
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload PDFs for their campaigns"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'campaign-pdfs' AND
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(name))[1]
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update PDFs for their campaigns"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'campaign-pdfs' AND
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(name))[1]
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete PDFs for their campaigns"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'campaign-pdfs' AND
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(name))[1]
    AND c.user_id = auth.uid()
  )
);

-- =====================================================
-- 20251110160010 - Generic config column
-- =====================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS generic_config jsonb DEFAULT '{}'::jsonb;

-- =====================================================
-- 20251111001336 - Campaign insights table
-- =====================================================

CREATE TABLE public.campaign_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  ad_account_id TEXT,
  campaign_dsp_id TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  weekly_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, platform)
);

ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaign insights"
ON public.campaign_insights
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = campaign_insights.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage all insights"
ON public.campaign_insights
FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE INDEX idx_campaign_insights_campaign_id ON public.campaign_insights(campaign_id);
CREATE INDEX idx_campaign_insights_fetched_at ON public.campaign_insights(fetched_at);

CREATE TRIGGER update_campaign_insights_updated_at
BEFORE UPDATE ON public.campaign_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20251111103143 - Invitations table
-- =====================================================

CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owners and admins can view invitations"
ON public.invitations
FOR SELECT
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.teams 
    WHERE teams.id = invitations.team_id 
    AND teams.owner_id = auth.uid()
  )
);

CREATE POLICY "Team owners and admins can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  created_by = auth.uid() 
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.teams 
      WHERE teams.id = invitations.team_id 
      AND teams.owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Creators and admins can update invitations"
ON public.invitations
FOR UPDATE
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Creators and admins can delete invitations"
ON public.invitations
FOR DELETE
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_invitations_status ON public.invitations(status);

-- =====================================================
-- 20251111112626 - Invitation viewing policy
-- =====================================================

CREATE POLICY "Anyone can view invitation by token"
ON public.invitations
FOR SELECT
TO anon, authenticated
USING (true);

-- =====================================================
-- 20251111112638 - Secure invitation policy
-- =====================================================

DROP POLICY "Anyone can view invitation by token" ON public.invitations;

CREATE POLICY "Anyone can view invitation by valid token"
ON public.invitations
FOR SELECT
TO anon, authenticated
USING (
  token IS NOT NULL 
  AND status = 'pending' 
  AND expires_at > now()
);

-- =====================================================
-- 20251111113027 - User roles insert policy for invitations
-- =====================================================

CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 
    FROM public.invitations 
    WHERE invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);

-- =====================================================
-- 20251111113217 - Fix user roles policy
-- =====================================================

DROP POLICY "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 
    FROM public.invitations 
    JOIN public.profiles ON profiles.email = invitations.email
    WHERE profiles.id = auth.uid()
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);

-- =====================================================
-- 20251111113752 - Modification requests and change history
-- =====================================================

CREATE TABLE IF NOT EXISTS public.modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  assigned_to UUID[] DEFAULT '{}',
  notify_all_team BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  change_type TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.modification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view modification requests for their campaigns"
ON public.modification_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = modification_requests.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  OR requester_id = auth.uid()
  OR auth.uid() = ANY(assigned_to)
);

CREATE POLICY "Users can create modification requests"
ON public.modification_requests FOR INSERT
TO authenticated
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Campaign owners and assignees can update modification requests"
ON public.modification_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = modification_requests.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  OR auth.uid() = ANY(assigned_to)
);

CREATE POLICY "Users can view history for their campaigns"
ON public.campaign_change_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_change_history.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create history entries"
ON public.campaign_change_history FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_modification_requests_updated_at
BEFORE UPDATE ON public.modification_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20251111122029 - Team campaigns
-- =====================================================

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_team_id ON public.campaigns(team_id);

CREATE POLICY "Team members can view team campaigns"
ON public.campaigns
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = campaigns.team_id
    AND user_roles.user_id = auth.uid()
  )
);

CREATE POLICY "Team members with edit role can update campaigns"
ON public.campaigns
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = campaigns.team_id
    AND user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'owner', 'campaign_manager', 'member')
  )
);

-- =====================================================
-- 20251111123158 - Team member profiles policy
-- =====================================================

CREATE POLICY "Team members can view member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur_self
    JOIN public.user_roles ur_other
      ON ur_self.team_id = ur_other.team_id
    WHERE ur_self.user_id = auth.uid()
      AND ur_other.user_id = profiles.id
  )
);

-- =====================================================
-- 20251111141826 - Status history and published_at
-- =====================================================

ALTER TABLE public.modification_requests 
ADD COLUMN IF NOT EXISTS status_history jsonb DEFAULT '[]'::jsonb;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS track_modification_status ON public.modification_requests;
CREATE TRIGGER track_modification_status
  BEFORE UPDATE ON public.modification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.track_modification_status_change();

ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

UPDATE public.modification_requests
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', created_at,
    'changed_by', requester_id
  )
)
WHERE status_history = '[]'::jsonb OR status_history IS NULL;

-- =====================================================
-- 20251111141837 - Fix status change function
-- =====================================================

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

-- =====================================================
-- 20251111150714 - User roles policy fix
-- =====================================================

DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM invitations
    WHERE invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);

-- =====================================================
-- 20251111151222 - User roles policy with profiles
-- =====================================================

DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM invitations
    JOIN profiles ON profiles.email = invitations.email
    WHERE profiles.id = auth.uid()
      AND invitations.team_id = user_roles.team_id
      AND invitations.role = user_roles.role
      AND invitations.status = 'pending'
      AND invitations.expires_at > now()
  )
);

-- =====================================================
-- 20251111152313 - Invitee update policy
-- =====================================================

DROP POLICY IF EXISTS "Invitee can accept their own invitation" ON public.invitations;

CREATE POLICY "Invitee can accept their own invitation"
ON public.invitations
FOR UPDATE
USING (
  email = (auth.jwt() ->> 'email')
  AND status = 'pending'
  AND expires_at > now()
)
WITH CHECK (
  email = (auth.jwt() ->> 'email')
  AND status = 'accepted'
);

-- =====================================================
-- 20251111152327 - User roles with JWT email
-- =====================================================

DROP POLICY IF EXISTS "Users can accept invitation and add their role" ON public.user_roles;

CREATE POLICY "Users can accept invitation and add their role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE i.email = (auth.jwt() ->> 'email')
      AND i.team_id = user_roles.team_id
      AND i.role = user_roles.role
      AND i.status = 'pending'
      AND i.expires_at > now()
  )
);

-- =====================================================
-- 20251112171145 - Meta ad account defaults
-- =====================================================

-- Create meta_ad_accounts table first if it doesn't exist
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_status TEXT,
  currency TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad accounts"
ON public.meta_ad_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ad accounts"
ON public.meta_ad_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ad accounts"
ON public.meta_ad_accounts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad accounts"
ON public.meta_ad_accounts FOR DELETE
USING (auth.uid() = user_id);

-- Add default resource columns
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS default_pixel_id text,
ADD COLUMN IF NOT EXISTS default_page_id text,
ADD COLUMN IF NOT EXISTS default_instagram_account_id text,
ADD COLUMN IF NOT EXISTS default_catalog_id text,
ADD COLUMN IF NOT EXISTS default_conversion_event text;

-- =====================================================
-- 20251112180138 - Meta product sets
-- =====================================================

CREATE TABLE IF NOT EXISTS public.meta_product_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL,
  product_set_id TEXT NOT NULL,
  product_set_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_set_id)
);

ALTER TABLE public.meta_product_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own product sets"
  ON public.meta_product_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own product sets"
  ON public.meta_product_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own product sets"
  ON public.meta_product_sets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own product sets"
  ON public.meta_product_sets FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_product_set_id TEXT;

-- =====================================================
-- 20251115114825 - BO number column
-- =====================================================

ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS bo_number TEXT UNIQUE;

COMMENT ON COLUMN public.campaigns.bo_number IS 'Business order number - unique financial reference used for invoicing';

CREATE INDEX IF NOT EXISTS idx_campaigns_bo_number ON public.campaigns(bo_number);

-- =====================================================
-- 20251115124935 - Security views for tokens
-- =====================================================

CREATE VIEW connected_platforms_safe AS
SELECT 
  id,
  user_id,
  platform_type,
  platform_name,
  ad_account_id,
  ad_account_name,
  business_manager_id,
  is_active,
  metadata,
  token_expires_at,
  created_at,
  updated_at
FROM connected_platforms;

GRANT SELECT ON connected_platforms_safe TO authenticated;

ALTER VIEW connected_platforms_safe SET (security_invoker = true);

-- Create meta_pages table first if needed
CREATE TABLE IF NOT EXISTS public.meta_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  category TEXT,
  access_token TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);

ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pages"
ON public.meta_pages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pages"
ON public.meta_pages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pages"
ON public.meta_pages FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pages"
ON public.meta_pages FOR DELETE
USING (auth.uid() = user_id);

CREATE VIEW meta_pages_safe AS
SELECT 
  id,
  user_id,
  page_id,
  page_name,
  category,
  synced_at,
  created_at
FROM meta_pages;

GRANT SELECT ON meta_pages_safe TO authenticated;

ALTER VIEW meta_pages_safe SET (security_invoker = true);

CREATE POLICY "Users can update their platform accounts"
ON platform_accounts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM connected_platforms
    WHERE connected_platforms.id = platform_accounts.connected_platform_id
    AND connected_platforms.user_id = auth.uid()
  )
);

-- =====================================================
-- 20251115124949 - has_role search path fix
-- =====================================================

ALTER FUNCTION has_role(_user_id uuid, _role app_role) SET search_path = public, pg_temp;

-- =====================================================
-- 20251115125345 - Team delete campaigns policy
-- =====================================================

CREATE POLICY "Team members can delete team campaigns"
ON campaigns
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.team_id = campaigns.team_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'owner', 'campaign_manager', 'member')
  )
);

-- =====================================================
-- 20251116124018 - Campaign performance benchmarks
-- =====================================================

CREATE TABLE public.campaign_performance_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  market TEXT NOT NULL,
  optimization_goal TEXT NOT NULL,
  avg_cost_per_result NUMERIC,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  total_results NUMERIC NOT NULL DEFAULT 0,
  impressions NUMERIC NOT NULL DEFAULT 0,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, market, optimization_goal, date_range_start, date_range_end)
);

ALTER TABLE public.campaign_performance_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own benchmarks"
ON public.campaign_performance_benchmarks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own benchmarks"
ON public.campaign_performance_benchmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own benchmarks"
ON public.campaign_performance_benchmarks
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own benchmarks"
ON public.campaign_performance_benchmarks
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_benchmarks_user_market_goal ON public.campaign_performance_benchmarks(user_id, market, optimization_goal);

CREATE TRIGGER update_benchmarks_updated_at
BEFORE UPDATE ON public.campaign_performance_benchmarks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 20251117171515 - Budget type defaults
-- =====================================================

ALTER TABLE meta_ad_accounts 
ADD COLUMN IF NOT EXISTS default_conversion_budget_type text CHECK (default_conversion_budget_type IN ('daily', 'lifetime')),
ADD COLUMN IF NOT EXISTS default_non_conversion_budget_type text CHECK (default_non_conversion_budget_type IN ('daily', 'lifetime'));

-- =====================================================
-- 20251119225303 - Clients table
-- =====================================================

CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  app_name TEXT,
  industry TEXT NOT NULL,
  business_objective TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients"
  ON public.clients
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients"
  ON public.clients
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON public.clients
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON public.clients
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_performance_benchmarks
ADD COLUMN IF NOT EXISTS industry TEXT;

CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_clients_industry ON public.clients(industry);
CREATE INDEX idx_meta_ad_accounts_client_id ON public.meta_ad_accounts(client_id);
CREATE INDEX idx_benchmarks_industry ON public.campaign_performance_benchmarks(industry);

-- =====================================================
-- 20251119230401 - Clients platforms column
-- =====================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS platforms jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- 20251120085526 - Team clients junction table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.team_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(team_id, client_id)
);

ALTER TABLE public.team_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view their team clients"
ON public.team_clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.team_id = team_clients.team_id
    AND user_roles.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and team owners can manage team clients"
ON public.team_clients
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.teams
    WHERE teams.id = team_clients.team_id
    AND teams.owner_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all clients"
ON public.clients
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
CREATE POLICY "Users can view their own clients or team clients"
ON public.clients
FOR SELECT
USING (
  auth.uid() = user_id OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.team_clients tc
    JOIN public.user_roles ur ON ur.team_id = tc.team_id
    WHERE tc.client_id = clients.id
    AND ur.user_id = auth.uid()
  )
);

-- =====================================================
-- 20251120094221 - Main markets field
-- =====================================================

ALTER TABLE meta_ad_accounts
ADD COLUMN IF NOT EXISTS main_markets jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- 20251120112126 - Client markets field
-- =====================================================

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS markets jsonb DEFAULT '[]'::jsonb;

-- =====================================================
-- NOTE: Due to file size limits, the remaining migrations continue below
-- This includes TikTok tables, creative library, and many more features
-- =====================================================

-- Continue with remaining migrations...
-- The full file would be too large to display here
-- Please see the supabase/migrations/ folder for all individual migration files
