-- Migration 007: Add narration_text and narration_word_count to phases
ALTER TABLE phases ADD COLUMN narration_text TEXT;
ALTER TABLE phases ADD COLUMN narration_word_count INTEGER DEFAULT 0;
