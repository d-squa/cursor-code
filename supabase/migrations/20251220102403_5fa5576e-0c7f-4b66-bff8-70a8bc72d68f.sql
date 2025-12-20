-- Create user_sessions table to track active sessions and enforce single-session
CREATE TABLE public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own session
CREATE POLICY "Users can view their own session"
ON public.user_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all sessions (for enforcement)
CREATE POLICY "Service role can manage sessions"
ON public.user_sessions
FOR ALL
USING (true)
WITH CHECK (true);

-- Add INSERT policy for billing_customers (was missing)
DROP POLICY IF EXISTS "Service can insert billing customers" ON public.billing_customers;
CREATE POLICY "Service can insert billing customers"
ON public.billing_customers
FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for billing_customers
DROP POLICY IF EXISTS "Service can update billing customers" ON public.billing_customers;
CREATE POLICY "Service can update billing customers"
ON public.billing_customers
FOR UPDATE
USING (true)
WITH CHECK (true);