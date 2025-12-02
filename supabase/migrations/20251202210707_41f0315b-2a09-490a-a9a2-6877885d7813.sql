-- Create taxonomy templates table
CREATE TABLE public.taxonomy_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  template JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE (ad_account_id, entity_type)
);

-- Enable RLS
ALTER TABLE public.taxonomy_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own taxonomy templates"
ON public.taxonomy_templates
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own taxonomy templates"
ON public.taxonomy_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own taxonomy templates"
ON public.taxonomy_templates
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own taxonomy templates"
ON public.taxonomy_templates
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_taxonomy_templates_updated_at
BEFORE UPDATE ON public.taxonomy_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();