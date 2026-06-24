import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Resolve absolute path (supports relative path in config)
const absoluteDbPath = path.isAbsolute(config.dbPath)
  ? config.dbPath
  : path.resolve(process.cwd(), config.dbPath);

// Ensure parent directory exists
const dbDir = path.dirname(absoluteDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(absoluteDbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints
db.pragma('foreign_keys = ON');

/**
 * Logs the column status of critical tables on startup.
 * Helps diagnose missing columns that cause silent insert failures.
 */
export function verifySchema(): void {
  const criticalTables = ['veo_prompts', 'phases', 'scenes', 'projects', 'video_metadata'];
  const expectedColumns: Record<string, string[]> = {
    veo_prompts: ['id', 'project_id', 'scene_id', 'phase_number', 'scene_number', 'prompt_number', 'visual', 'shot', 'shot_type', 'lens', 'lighting', 'camera', 'ambient_sound', 'sfx', 'dialogue', 'avoid', 'connection', 'narration', 'raw_json', 'version', 'scene_type'],
    phases: ['id', 'project_id', 'phase_number', 'phase_type', 'phase_title', 'phase_content', 'approved', 'scenes_generated', 'status', 'narration_text', 'narration_word_count'],
    scenes: ['id', 'project_id', 'phase_id', 'phase_number', 'scene_number', 'title', 'scene_description', 'continuity_notes', 'narration_fragment', 'veo_prompt_generated', 'status', 'narration_word_count', 'raw_json', 'continuity_stale'],
    projects: ['id', 'title', 'topic', 'visual_style', 'narration_language', 'aspect_ratio', 'status', 'style_id', 'target_duration_minutes'],
    video_metadata: ['id', 'project_id', 'raw_json', 'selected_title', 'description', 'chapters', 'tags', 'hashtags', 'thumbnail_hook'],
  };

  console.log('\n=== DB Schema Verification ===');
  for (const table of criticalTables) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];
      const colNames = columns.map(c => c.name);
      const expected = expectedColumns[table] || [];
      const missing = expected.filter(col => !colNames.includes(col));

      if (missing.length > 0) {
        console.warn(`  ⚠ ${table}: MISSING columns → [${missing.join(', ')}]`);
      } else {
        console.log(`  ✓ ${table}: all ${expected.length} expected columns present`);
      }
    } catch (err: any) {
      console.error(`  ✗ ${table}: table does not exist or error → ${err.message}`);
    }
  }
  console.log('=== End Schema Verification ===\n');
}

export default db;
export { absoluteDbPath };
