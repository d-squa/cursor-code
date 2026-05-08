-- Ensure asset customization tables exist when legacy migrations were never applied
-- (fixes PostgREST PGRST205 on GET .../asset_customization_groups).

CREATE TABLE IF NOT EXISTS public.asset_customization_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  group_name text NOT NULL,
  customization_type text NOT NULL CHECK (customization_type IN ('placement', 'language', 'flexible_creative')),
  platform text NOT NULL DEFAULT 'meta',
  market text,
  phase_name text,
  ad_set_name text,
  default_language text,
  language_mappings jsonb DEFAULT '[]'::jsonb,
  asset_feed_spec jsonb,
  customization_rules jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'compiled', 'pushed', 'error')),
  validation_errors jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_customization_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.asset_customization_groups(id) ON DELETE CASCADE,
  assignment_id text NOT NULL,
  creative_id text NOT NULL,
  delivery_bucket text NOT NULL CHECK (delivery_bucket IN ('vertical', 'square', 'landscape', 'other')),
  aspect_ratio text,
  position integer DEFAULT 0,
  language text,
  mapped_placements jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, assignment_id)
);

ALTER TABLE public.asset_customization_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_customization_group_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_groups'
      AND policyname = 'Users can view own groups'
  ) THEN
    CREATE POLICY "Users can view own groups" ON public.asset_customization_groups
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_groups'
      AND policyname = 'Users can insert own groups'
  ) THEN
    CREATE POLICY "Users can insert own groups" ON public.asset_customization_groups
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_groups'
      AND policyname = 'Users can update own groups'
  ) THEN
    CREATE POLICY "Users can update own groups" ON public.asset_customization_groups
      FOR UPDATE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_groups'
      AND policyname = 'Users can delete own groups'
  ) THEN
    CREATE POLICY "Users can delete own groups" ON public.asset_customization_groups
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_group_members'
      AND policyname = 'Users can view members of own groups'
  ) THEN
    CREATE POLICY "Users can view members of own groups" ON public.asset_customization_group_members
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.asset_customization_groups g
          WHERE g.id = group_id AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_group_members'
      AND policyname = 'Users can insert members to own groups'
  ) THEN
    CREATE POLICY "Users can insert members to own groups" ON public.asset_customization_group_members
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.asset_customization_groups g
          WHERE g.id = group_id AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_group_members'
      AND policyname = 'Users can update members of own groups'
  ) THEN
    CREATE POLICY "Users can update members of own groups" ON public.asset_customization_group_members
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.asset_customization_groups g
          WHERE g.id = group_id AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_customization_group_members'
      AND policyname = 'Users can delete members of own groups'
  ) THEN
    CREATE POLICY "Users can delete members of own groups" ON public.asset_customization_group_members
      FOR DELETE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.asset_customization_groups g
          WHERE g.id = group_id AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_customization_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_customization_group_members TO authenticated;

CREATE INDEX IF NOT EXISTS idx_asset_customization_groups_campaign_id
  ON public.asset_customization_groups (campaign_id);
CREATE INDEX IF NOT EXISTS idx_asset_customization_group_members_group_id
  ON public.asset_customization_group_members (group_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_asset_customization_groups_updated_at'
  ) THEN
    CREATE TRIGGER update_asset_customization_groups_updated_at
      BEFORE UPDATE ON public.asset_customization_groups
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
