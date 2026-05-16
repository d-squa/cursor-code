-- campaign-pdfs storage: allow team members (not only campaign.user_id) to upload/view PDFs.

DROP POLICY IF EXISTS "Users can view their campaign PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload PDFs for their campaigns" ON storage.objects;
DROP POLICY IF EXISTS "Users can update PDFs for their campaigns" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete PDFs for their campaigns" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_manage_campaign_pdf(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(object_name))[1]
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.team_id = c.team_id
            AND ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'owner', 'campaign_manager', 'member')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_campaign_pdf(text) IS
  'True when auth user owns the campaign or is a team member with edit access (path: {campaign_id}/file.pdf).';

CREATE POLICY "Campaign PDFs: team members can view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-pdfs'
  AND public.can_manage_campaign_pdf(name)
);

CREATE POLICY "Campaign PDFs: team members can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-pdfs'
  AND public.can_manage_campaign_pdf(name)
);

CREATE POLICY "Campaign PDFs: team members can update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'campaign-pdfs'
  AND public.can_manage_campaign_pdf(name)
)
WITH CHECK (
  bucket_id = 'campaign-pdfs'
  AND public.can_manage_campaign_pdf(name)
);

CREATE POLICY "Campaign PDFs: team members can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-pdfs'
  AND public.can_manage_campaign_pdf(name)
);
