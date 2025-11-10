-- Add forecast data and PDF storage to campaigns
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS forecast_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Create storage bucket for campaign PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-pdfs', 'campaign-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for campaign PDFs bucket
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