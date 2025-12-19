-- Fix migration: Postgres does not support CREATE POLICY IF NOT EXISTS

-- Create mapping between app users and Stripe customers to prevent cross-account subscription leakage
create table if not exists public.billing_customers (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_customers_email_idx on public.billing_customers (email);

alter table public.billing_customers enable row level security;

-- Recreate policy idempotently
drop policy if exists "Users can view their billing customer mapping" on public.billing_customers;
create policy "Users can view their billing customer mapping"
on public.billing_customers
for select
using (auth.uid() = user_id);

-- Keep updated_at current
drop trigger if exists update_billing_customers_updated_at on public.billing_customers;
create trigger update_billing_customers_updated_at
before update on public.billing_customers
for each row execute function public.update_updated_at_column();