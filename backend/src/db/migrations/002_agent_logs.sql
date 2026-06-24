-- Migration 002: Agent Logs DB Schema

CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  model_used TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL, -- success|failed
  error_message TEXT,
  input_prompt TEXT,
  output_response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_lookup ON agent_logs(project_id, agent_name);
