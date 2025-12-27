-- Create enum for creative types
CREATE TYPE public.creative_type AS ENUM ('dark_post', 'existing_post', 'image', 'video', 'carousel', 'collection', 'instant_experience');

-- Create enum for creative status
CREATE TYPE public.creative_status AS ENUM ('draft', 'ready', 'needs_review', 'error', 'published');

-- Create creatives table for the Creative Library
CREATE TABLE public.creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Basic info
  name TEXT NOT NULL,
  creative_type creative_type NOT NULL DEFAULT 'dark_post',
  status creative_status NOT NULL DEFAULT 'draft',
  
  -- Platform targeting
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok', 'google', 'linkedin', 'snapchat', 'pinterest', 'x')),
  
  -- ActiPlan mapping (taxonomy-based)
  market TEXT,
  phase_name TEXT,
  optimization_goal TEXT,
  funnel_stage TEXT,
  
  -- Media assets (URLs - stored in storage bucket or external)
  media_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  
  -- Creative copy
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  caption TEXT,
  call_to_action TEXT,
  destination_url TEXT,
  
  -- For existing posts (reference by ID)
  external_post_id TEXT,
  external_page_id TEXT,
  external_account_name TEXT,
  
  -- Platform-specific metadata
  platform_metadata JSONB DEFAULT '{}',
  
  -- Validation
  validation_errors TEXT[] DEFAULT '{}',
  is_valid BOOLEAN GENERATED ALWAYS AS (array_length(validation_errors, 1) IS NULL OR array_length(validation_errors, 1) = 0) STORED,
  
  -- Dimensions & format info
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  
  -- Folder structure metadata (for folder uploads)
  folder_path TEXT,
  original_filename TEXT,
  
  -- Spreadsheet import metadata
  spreadsheet_row_number INTEGER,
  import_batch_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create creative_assignments table for mapping creatives to campaign structure
CREATE TABLE public.creative_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES public.creatives(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  -- ActiPlan structure mapping
  platform TEXT NOT NULL,
  market TEXT NOT NULL,
  phase_name TEXT NOT NULL,
  
  -- Assignment metadata
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  assigned_by UUID REFERENCES auth.users(id),
  
  -- Position for ordering within ad set
  position INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'pushed', 'error')),
  dsp_creative_id TEXT,
  error_message TEXT,
  
  UNIQUE(creative_id, campaign_id, platform, market, phase_name)
);

-- Create import_batches table for tracking uploads
CREATE TABLE public.creative_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  import_type TEXT NOT NULL CHECK (import_type IN ('folder', 'spreadsheet', 'manual')),
  source_filename TEXT,
  
  total_items INTEGER DEFAULT 0,
  successful_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_log JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_import_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for creatives
CREATE POLICY "Users can view their own creatives"
  ON public.creatives FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creatives"
  ON public.creatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creatives"
  ON public.creatives FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creatives"
  ON public.creatives FOR DELETE
  USING (auth.uid() = user_id);

-- Team members can view team creatives
CREATE POLICY "Team members can view team creatives"
  ON public.creatives FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- RLS policies for creative_assignments
CREATE POLICY "Users can view their assignments"
  ON public.creative_assignments FOR SELECT
  USING (
    creative_id IN (SELECT id FROM public.creatives WHERE user_id = auth.uid())
    OR campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert assignments"
  ON public.creative_assignments FOR INSERT
  WITH CHECK (
    creative_id IN (SELECT id FROM public.creatives WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their assignments"
  ON public.creative_assignments FOR UPDATE
  USING (
    creative_id IN (SELECT id FROM public.creatives WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete their assignments"
  ON public.creative_assignments FOR DELETE
  USING (
    creative_id IN (SELECT id FROM public.creatives WHERE user_id = auth.uid())
  );

-- RLS policies for import batches
CREATE POLICY "Users can view their import batches"
  ON public.creative_import_batches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert import batches"
  ON public.creative_import_batches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their import batches"
  ON public.creative_import_batches FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_creatives_user_id ON public.creatives(user_id);
CREATE INDEX idx_creatives_campaign_id ON public.creatives(campaign_id);
CREATE INDEX idx_creatives_platform_market ON public.creatives(platform, market);
CREATE INDEX idx_creatives_status ON public.creatives(status);
CREATE INDEX idx_creative_assignments_campaign ON public.creative_assignments(campaign_id);
CREATE INDEX idx_creative_assignments_creative ON public.creative_assignments(creative_id);

-- Update trigger for creatives
CREATE TRIGGER update_creatives_updated_at
  BEFORE UPDATE ON public.creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for creative assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creative-assets',
  'creative-assets',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
);

-- Storage policies for creative assets
CREATE POLICY "Users can upload creative assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'creative-assets' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their creative assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'creative-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view creative assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'creative-assets');

CREATE POLICY "Users can update their creative assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'creative-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their creative assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'creative-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );