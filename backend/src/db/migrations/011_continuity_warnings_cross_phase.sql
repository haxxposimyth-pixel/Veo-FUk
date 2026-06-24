-- Migration 011: Add cross_phase column to continuity_warnings table
ALTER TABLE continuity_warnings ADD COLUMN cross_phase INTEGER DEFAULT 0;
