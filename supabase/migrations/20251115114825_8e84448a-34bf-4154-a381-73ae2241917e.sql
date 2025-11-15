-- Add bo_number column to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN bo_number TEXT UNIQUE;

-- Add comment explaining the column
COMMENT ON COLUMN public.campaigns.bo_number IS 'Business order number - unique financial reference used for invoicing';

-- Create index for faster lookups
CREATE INDEX idx_campaigns_bo_number ON public.campaigns(bo_number);
