CREATE TABLE IF NOT EXISTS gemini_keys (
  id TEXT PRIMARY KEY,
  key_value TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS key_model_quota (
  key_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  cooldown_until INTEGER NOT NULL,
  reason TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key_id, model_name),
  FOREIGN KEY(key_id) REFERENCES gemini_keys(id) ON DELETE CASCADE
);
