-- Remove the strict format validation constraint on bo_number
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS bo_number_format;

-- Add a simpler constraint that just checks it's not empty when provided
-- (we'll handle the "required" part in the frontend)