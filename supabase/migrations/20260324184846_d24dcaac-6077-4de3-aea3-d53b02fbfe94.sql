
-- Asset Customization Groups table
-- Stores grouped creatives with customization type and compiled asset_feed_spec
CREATE TABLE public.asset_customization_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  
  -- Group metadata
  group_name TEXT NOT NULL,
  customization_type TEXT NOT NULL CHECK (customization_type IN ('placement', 'language', 'flexible_creative')),
  platform TEXT NOT NULL DEFAULT 'meta',
  market TEXT,
  phase_name TEXT,
  ad_set_name TEXT,
  
  -- Language customization specific
  default_language TEXT,
  language_mappings JSONB DEFAULT '[]'::jsonb,
  
  -- Compiled payload
  asset_feed_spec JSONB,
  customization_rules JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'compiled', 'pushed', 'error')),
  validation_errors JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asset Customization Group Members - links creative assignments to groups
CREATE TABLE public.asset_customization_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.asset_customization_groups(id) ON DELETE CASCADE NOT NULL,
  assignment_id TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  
  -- Delivery bucket classification
  delivery_bucket TEXT NOT NULL CHECK (delivery_bucket IN ('vertical', 'square', 'landscape', 'other')),
  aspect_ratio TEXT,
  
  -- Position/ordering within group
  position INTEGER DEFAULT 0,
  
  -- Language (for language customization)
  language TEXT,
  
  -- Placement mapping (for placement customization)
  mapped_placements JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (group_id, assignment_id)
);

-- Enable RLS
ALTER TABLE public.asset_customization_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_customization_group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for asset_customization_groups
CREATE POLICY "Users can view own groups" ON public.asset_customization_groups
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own groups" ON public.asset_customization_groups
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own groups" ON public.asset_customization_groups
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own groups" ON public.asset_customization_groups
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS policies for members via group ownership
CREATE POLICY "Users can view members of own groups" ON public.asset_customization_group_members
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asset_customization_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
  );

CREATE POLICY "Users can insert members to own groups" ON public.asset_customization_group_members
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.asset_customization_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
  );

CREATE POLICY "Users can update members of own groups" ON public.asset_customization_group_members
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asset_customization_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
  );

CREATE POLICY "Users can delete members of own groups" ON public.asset_customization_group_members
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asset_customization_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
  );

-- Updated_at trigger
CREATE TRIGGER update_asset_customization_groups_updated_at
  BEFORE UPDATE ON public.asset_customization_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
