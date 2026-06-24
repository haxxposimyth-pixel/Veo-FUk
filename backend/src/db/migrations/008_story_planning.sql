-- Migration 008: Story Planning Table

CREATE TABLE IF NOT EXISTS story_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  story_outline TEXT NOT NULL,
  character_list TEXT NOT NULL,
  location_list TEXT NOT NULL,
  object_list TEXT NOT NULL,
  estimated_runtime TEXT NOT NULL,
  estimated_scene_count INTEGER NOT NULL,
  complexity_score INTEGER NOT NULL,
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
