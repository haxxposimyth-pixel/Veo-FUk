-- Migration 016: Add movie_config to projects
ALTER TABLE projects ADD COLUMN movie_config TEXT DEFAULT NULL;
