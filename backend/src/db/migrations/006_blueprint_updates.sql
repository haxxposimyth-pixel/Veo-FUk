-- Migration 006: Blueprint Updates

-- Add style_id to projects
ALTER TABLE projects ADD COLUMN style_id TEXT REFERENCES custom_styles(id);

-- Add narration_word_count to scenes
ALTER TABLE scenes ADD COLUMN narration_word_count INTEGER DEFAULT 0;

-- Add phase_id to continuity_warnings
-- SQLite doesn't let us easily add a true foreign key constraint to an existing table, 
-- but adding the column helps align the schema logically with the requested endpoints.
ALTER TABLE continuity_warnings ADD COLUMN phase_id TEXT REFERENCES phases(id);
