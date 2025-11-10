-- Add new values to app_role enum (must be done separately)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'collaborator';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'member';