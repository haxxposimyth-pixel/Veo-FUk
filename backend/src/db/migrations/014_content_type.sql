-- Migration 014: Add content_type to projects and video_type to story_plans
ALTER TABLE projects ADD COLUMN content_type TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE story_plans ADD COLUMN video_type TEXT NOT NULL DEFAULT 'documentary';
