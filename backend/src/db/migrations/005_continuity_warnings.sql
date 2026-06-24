-- Migration 005: Continuity Warnings

CREATE TABLE IF NOT EXISTS continuity_warnings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  prompt_number INTEGER NOT NULL DEFAULT 0,
  field TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) 
    REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) 
    REFERENCES phases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_continuity_warnings_project_phase ON continuity_warnings(project_id, phase_id);
