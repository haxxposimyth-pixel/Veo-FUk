-- Migration 003: Add status column to phases and scenes
ALTER TABLE phases ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE scenes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
