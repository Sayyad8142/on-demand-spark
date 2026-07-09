
-- Voice Assistant Phase 1: analytics tables
CREATE TABLE public.voice_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  worker_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  language TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.voice_conversations TO authenticated;
GRANT ALL ON public.voice_conversations TO service_role;
ALTER TABLE public.voice_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers view own voice convos"
  ON public.voice_conversations FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Workers insert own voice convos"
  ON public.voice_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Workers update own voice convos"
  ON public.voice_conversations FOR UPDATE
  USING (auth.uid() = user_id);
CREATE INDEX idx_voice_conversations_user ON public.voice_conversations(user_id, started_at DESC);

CREATE TABLE public.voice_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.voice_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content TEXT,
  tool_calls JSONB,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.voice_messages TO authenticated;
GRANT ALL ON public.voice_messages TO service_role;
ALTER TABLE public.voice_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers view own voice messages"
  ON public.voice_messages FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Workers insert own voice messages"
  ON public.voice_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_voice_messages_convo ON public.voice_messages(conversation_id, created_at);

CREATE TABLE public.voice_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  worker_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.voice_events TO authenticated;
GRANT ALL ON public.voice_events TO service_role;
ALTER TABLE public.voice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers insert own voice events"
  ON public.voice_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Workers view own voice events"
  ON public.voice_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE INDEX idx_voice_events_user ON public.voice_events(user_id, created_at DESC);
