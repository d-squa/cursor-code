-- Add generic_config column to campaigns table to store strategy configuration
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS generic_config jsonb DEFAULT '{}'::jsonb;