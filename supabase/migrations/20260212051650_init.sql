-- conversation_state: active session per user
CREATE TABLE conversation_state (
  user_id         TEXT PRIMARY KEY,
  instance        TEXT NOT NULL,
  active_flow     TEXT,
  active_subroute TEXT,
  step            TEXT NOT NULL DEFAULT 'start',
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_conv_expires ON conversation_state (expires_at);

-- chat_messages: inbound + outbound message log
CREATE TABLE chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  instance    TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_id  TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: dedup inbound messages by message_id (nulls excluded)
CREATE UNIQUE INDEX idx_msg_id ON chat_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_chat_user_time ON chat_messages (user_id, created_at DESC);
