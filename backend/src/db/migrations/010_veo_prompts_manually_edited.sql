-- Migration 010: Add manually_edited column to veo_prompts table
ALTER TABLE veo_prompts ADD COLUMN manually_edited INTEGER DEFAULT 0;
