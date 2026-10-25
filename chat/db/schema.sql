-- Phaedra Chat owns these tables. No other project's tables are touched.
CREATE TABLE IF NOT EXISTS phaedra_chat_sessions (
  token_hash TEXT PRIMARY KEY,
  nickname VARCHAR(24) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  room TEXT NOT NULL DEFAULT 'general'
    CHECK (room IN ('general', 'produccion', 'ayuda', 'desarrollo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS phaedra_chat_sessions_recent_ip
  ON phaedra_chat_sessions (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS phaedra_chat_sessions_presence
  ON phaedra_chat_sessions (room, last_seen DESC);

CREATE TABLE IF NOT EXISTS phaedra_chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room TEXT NOT NULL CHECK (room IN ('general', 'produccion', 'ayuda', 'desarrollo')),
  nickname VARCHAR(24) NOT NULL,
  author_hash TEXT NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  rate_bucket BIGINT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT phaedra_chat_rate_guard UNIQUE (ip_hash, rate_bucket)
);
CREATE INDEX IF NOT EXISTS phaedra_chat_messages_history
  ON phaedra_chat_messages (room, id DESC) WHERE hidden = FALSE;
CREATE INDEX IF NOT EXISTS phaedra_chat_messages_ip_day
  ON phaedra_chat_messages (ip_hash, at DESC);
