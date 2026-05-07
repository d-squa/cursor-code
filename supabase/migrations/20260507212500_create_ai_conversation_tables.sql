CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Conversation',
  context_type text DEFAULT 'general',
  context_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_conversation_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, shared_with)
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can view own conversations'
  ) THEN
    CREATE POLICY "Users can view own conversations"
      ON public.ai_conversations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can create conversations'
  ) THEN
    CREATE POLICY "Users can create conversations"
      ON public.ai_conversations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can update own conversations'
  ) THEN
    CREATE POLICY "Users can update own conversations"
      ON public.ai_conversations FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can delete own conversations'
  ) THEN
    CREATE POLICY "Users can delete own conversations"
      ON public.ai_conversations FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can view messages of own conversations'
  ) THEN
    CREATE POLICY "Users can view messages of own conversations"
      ON public.ai_messages FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.ai_conversations c
          WHERE c.id = conversation_id AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can insert messages to own conversations'
  ) THEN
    CREATE POLICY "Users can insert messages to own conversations"
      ON public.ai_messages FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ai_conversations c
          WHERE c.id = conversation_id AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_shares_shared_with ON public.ai_conversation_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_shares_token ON public.ai_conversation_shares(share_token);
