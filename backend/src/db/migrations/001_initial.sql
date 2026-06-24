-- Migration 001: Initial DB Schema

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  visual_style TEXT NOT NULL,
  narration_language TEXT NOT NULL DEFAULT 'English',
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  status TEXT NOT NULL DEFAULT 'setup',
  youtube_transcript TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_bibles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_roster TEXT NOT NULL,
  location_roster TEXT NOT NULL,
  object_registry TEXT NOT NULL,
  visual_style_lock TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  raw_json TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  phase_type TEXT NOT NULL,
  phase_title TEXT NOT NULL,
  phase_content TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  scenes_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, phase_number)
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  scene_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  scene_description TEXT NOT NULL,
  continuity_notes TEXT NOT NULL,
  narration_fragment TEXT NOT NULL,
  veo_prompt_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, phase_number, scene_number)
);

CREATE TABLE IF NOT EXISTS veo_prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  scene_number INTEGER NOT NULL,
  prompt_number TEXT NOT NULL,
  visual TEXT NOT NULL,
  shot TEXT NOT NULL,
  lens TEXT NOT NULL,
  lighting TEXT NOT NULL,
  camera TEXT NOT NULL,
  ambient_sound TEXT NOT NULL,
  sfx TEXT NOT NULL,
  dialogue TEXT NOT NULL DEFAULT 'None.',
  avoid TEXT NOT NULL,
  connection TEXT NOT NULL,
  narration TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_scenes_lookup ON scenes(project_id, phase_number);
CREATE INDEX IF NOT EXISTS idx_veo_prompts_lookup ON veo_prompts(project_id, phase_number, scene_number);
