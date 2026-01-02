-- Update creative-assets bucket to allow larger files (500MB max)
UPDATE storage.buckets 
SET file_size_limit = 524288000
WHERE id = 'creative-assets';