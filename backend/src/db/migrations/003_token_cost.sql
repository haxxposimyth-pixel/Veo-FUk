-- Migration 003: Token Cost Tracking Columns
ALTER TABLE agent_logs ADD COLUMN total_tokens INTEGER;
ALTER TABLE agent_logs ADD COLUMN cached_tokens INTEGER;
ALTER TABLE agent_logs ADD COLUMN thinking_tokens INTEGER;
ALTER TABLE agent_logs ADD COLUMN cost REAL;
ALTER TABLE agent_logs ADD COLUMN tokens_estimated INTEGER DEFAULT 0;
ALTER TABLE agent_logs ADD COLUMN billing_source TEXT;
ALTER TABLE agent_logs ADD COLUMN phase_number INTEGER;
