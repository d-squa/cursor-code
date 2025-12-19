-- Security hardening (linter): pin search_path for functions + reinstall pg_net into extensions schema

-- 1) Pin search_path on functions flagged by linter
alter function public.get_platform_token(uuid, text) set search_path = public, pg_temp;
alter function public.store_platform_token(uuid, text, text) set search_path = public, pg_temp;
alter function public.migrate_tokens_to_vault() set search_path = public, pg_temp;
alter function public.update_updated_at_column() set search_path = public, pg_temp;

-- 2) Move pg_net out of public by reinstalling it into extensions schema
-- pg_net is not relocatable (ALTER EXTENSION ... SET SCHEMA fails), so we drop + recreate
create schema if not exists extensions;
drop extension if exists pg_net cascade;
create extension pg_net with schema extensions;