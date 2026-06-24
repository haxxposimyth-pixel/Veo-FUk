-- Migration 012: Add visual_truncated column to veo_prompts table
ALTER TABLE veo_prompts ADD COLUMN visual_truncated INTEGER DEFAULT 0;
