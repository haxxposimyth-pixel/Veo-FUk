import db from '../connection';
import fs from 'fs';
import path from 'path';

const MIGRATION_FILES = ['001_initial.sql', '002_agent_logs.sql', '004_custom_styles.sql', '005_continuity_warnings.sql', '006_fix_continuity_warnings.sql', '008_story_planning.sql', '009_veo_prompts_index.sql', '013_gemini_key_pool.sql'];

/**
 * Runs all SQL migration files in order.
 * All migrations use IF NOT EXISTS — safe to re-run on every start.
 */
export function runMigrations(): void {
  console.log('Running database migrations...');

  db.transaction(() => {
    for (const file of MIGRATION_FILES) {
      const filePath = path.resolve(__dirname, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`Migration not found, skipping: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf-8');
      db.exec(sql);
      console.log(`  ✓ ${file}`);
    }

    // Migration 003: Add status column to phases and scenes (resilient)
    const hasStatusPhase = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'status');
    if (!hasStatusPhase) {
      db.prepare("ALTER TABLE phases ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
      console.log('  ✓ 003_pacing_status.sql (phases)');
    }
    const hasStatusScene = (db.prepare("PRAGMA table_info(scenes)").all() as any[]).some((col: any) => col.name === 'status');
    if (!hasStatusScene) {
      db.prepare("ALTER TABLE scenes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
      console.log('  ✓ 003_pacing_status.sql (scenes)');
    }

    // Migration 006: Add style_id to projects, narration_word_count to scenes, phase_id to continuity_warnings
    const hasStyleId = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((col: any) => col.name === 'style_id');
    if (!hasStyleId) {
      db.prepare("ALTER TABLE projects ADD COLUMN style_id TEXT REFERENCES custom_styles(id)").run();
      console.log('  ✓ 006_blueprint_updates (projects.style_id)');
    }
    const hasNarrationWordCountScene = (db.prepare("PRAGMA table_info(scenes)").all() as any[]).some((col: any) => col.name === 'narration_word_count');
    if (!hasNarrationWordCountScene) {
      db.prepare("ALTER TABLE scenes ADD COLUMN narration_word_count INTEGER DEFAULT 0").run();
      console.log('  ✓ 006_blueprint_updates (scenes.narration_word_count)');
    }
    const hasPhaseIdWarning = (db.prepare("PRAGMA table_info(continuity_warnings)").all() as any[]).some((col: any) => col.name === 'phase_id');
    if (!hasPhaseIdWarning) {
      db.prepare("ALTER TABLE continuity_warnings ADD COLUMN phase_id TEXT REFERENCES phases(id)").run();
      console.log('  ✓ 006_blueprint_updates (continuity_warnings.phase_id)');
    }

    // Migration 007: Add narration_text and narration_word_count to phases
    const hasNarrationTextPhase = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'narration_text');
    if (!hasNarrationTextPhase) {
      db.prepare("ALTER TABLE phases ADD COLUMN narration_text TEXT").run();
      console.log('  ✓ 007_phases_narration (phases.narration_text)');
    }
    const hasNarrationWordCountPhase = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'narration_word_count');
    if (!hasNarrationWordCountPhase) {
      db.prepare("ALTER TABLE phases ADD COLUMN narration_word_count INTEGER DEFAULT 0").run();
      console.log('  ✓ 007_phases_narration (phases.narration_word_count)');
    }

    // Migration 008: Add dialogue TEXT NOT NULL DEFAULT 'None.' to veo_prompts
    const hasDialogueVeoPrompt = (db.prepare("PRAGMA table_info(veo_prompts)").all() as any[]).some((col: any) => col.name === 'dialogue');
    if (!hasDialogueVeoPrompt) {
      db.prepare("ALTER TABLE veo_prompts ADD COLUMN dialogue TEXT NOT NULL DEFAULT 'None.'").run();
      console.log('  ✓ 008_veo_prompts_dialogue (veo_prompts.dialogue)');
    }

    // Migration 010: Add manually_edited column to veo_prompts table
    const hasManuallyEdited = (db.prepare("PRAGMA table_info(veo_prompts)").all() as any[]).some((col: any) => col.name === 'manually_edited');
    if (!hasManuallyEdited) {
      db.prepare("ALTER TABLE veo_prompts ADD COLUMN manually_edited INTEGER DEFAULT 0").run();
      console.log('  ✓ 010_veo_prompts_manually_edited (veo_prompts.manually_edited)');
    }

    // Migration 011: Add cross_phase to continuity_warnings
    const hasCrossPhase = (db.prepare("PRAGMA table_info(continuity_warnings)").all() as any[]).some((col: any) => col.name === 'cross_phase');
    if (!hasCrossPhase) {
      db.prepare("ALTER TABLE continuity_warnings ADD COLUMN cross_phase INTEGER DEFAULT 0").run();
      console.log('  ✓ 011_continuity_warnings_cross_phase (continuity_warnings.cross_phase)');
    }

    // Migration 012: Add visual_truncated column to veo_prompts table
    const hasVisualTruncated = (db.prepare("PRAGMA table_info(veo_prompts)").all() as any[]).some((col: any) => col.name === 'visual_truncated');
    if (!hasVisualTruncated) {
      db.prepare("ALTER TABLE veo_prompts ADD COLUMN visual_truncated INTEGER DEFAULT 0").run();
      console.log('  ✓ 012_veo_prompts_visual_truncated (veo_prompts.visual_truncated)');
    }

    // Migration 019: Add repair_attempts column to agent_logs table
    const hasRepairAttempts = (db.prepare("PRAGMA table_info(agent_logs)").all() as any[]).some((col: any) => col.name === 'repair_attempts');
    if (!hasRepairAttempts) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN repair_attempts INTEGER DEFAULT 0").run();
      console.log('  ✓ 019_repair_attempts.sql (agent_logs)');
    }

    // Migration 014 (Custom execution): Add content_type to projects and video_type to story_plans
    const hasContentType = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((col: any) => col.name === 'content_type');
    if (!hasContentType) {
      db.prepare("ALTER TABLE projects ADD COLUMN content_type TEXT NOT NULL DEFAULT 'auto'").run();
      console.log('  ✓ Added content_type column to projects table');
    }
    const hasVideoTypeStoryPlan = (db.prepare("PRAGMA table_info(story_plans)").all() as any[]).some((col: any) => col.name === 'video_type');
    if (!hasVideoTypeStoryPlan) {
      db.prepare("ALTER TABLE story_plans ADD COLUMN video_type TEXT NOT NULL DEFAULT 'documentary'").run();
      console.log('  ✓ Added video_type column to story_plans table');
    }

    const hasConceptBrief = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((c: any) => c.name === 'concept_brief');
    if (!hasConceptBrief) {
      db.prepare("ALTER TABLE projects ADD COLUMN concept_brief TEXT").run();
      console.log('  ✓ Added concept_brief column');
    }

    // Migration 015: Add content_profile to projects
    const hasContentProfile = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((col: any) => col.name === 'content_profile');
    if (!hasContentProfile) {
      db.prepare("ALTER TABLE projects ADD COLUMN content_profile TEXT NOT NULL DEFAULT 'viral_story'").run();
      console.log('  ✓ Added content_profile column to projects table');
    }

    // Migration 016: Add movie_config to projects
    const hasMovieConfig = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((col: any) => col.name === 'movie_config');
    if (!hasMovieConfig) {
      db.prepare("ALTER TABLE projects ADD COLUMN movie_config TEXT DEFAULT NULL").run();
      console.log('  ✓ Added movie_config column to projects table');
    }

    const hasRenderFamily = (db.prepare("PRAGMA table_info(custom_styles)").all() as any[]).some((col: any) => col.name === 'render_family');
    if (!hasRenderFamily) {
      db.prepare("ALTER TABLE custom_styles ADD COLUMN render_family TEXT").run();
      console.log('  ✓ Added render_family column to custom_styles table');
    }

    // Migration: Drop unused story_plans columns (estimated_runtime, estimated_scene_count, complexity_score)
    const storyPlanCols = db.prepare("PRAGMA table_info(story_plans)").all() as any[];
    const storyPlanColNames = storyPlanCols.map((col: any) => col.name);
    if (storyPlanColNames.includes('estimated_runtime')) {
      db.prepare("ALTER TABLE story_plans DROP COLUMN estimated_runtime").run();
      console.log('  ✓ Dropped story_plans.estimated_runtime');
    }
    if (storyPlanColNames.includes('estimated_scene_count')) {
      db.prepare("ALTER TABLE story_plans DROP COLUMN estimated_scene_count").run();
      console.log('  ✓ Dropped story_plans.estimated_scene_count');
    }
    if (storyPlanColNames.includes('complexity_score')) {
      db.prepare("ALTER TABLE story_plans DROP COLUMN complexity_score").run();
      console.log('  ✓ Dropped story_plans.complexity_score');
    }


    // Migration 021: Add api_key_index column to agent_logs table
    const hasApiKeyIndex = (db.prepare("PRAGMA table_info(agent_logs)").all() as any[]).some((col: any) => col.name === 'api_key_index');
    if (!hasApiKeyIndex) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN api_key_index INTEGER DEFAULT NULL").run();
      console.log('  ✓ 021_agent_logs_api_key_index (agent_logs.api_key_index)');
    }

    // Migration 022: Add token and cost tracking columns to agent_logs table
    const agentLogsCols = db.prepare("PRAGMA table_info(agent_logs)").all() as any[];
    const colNames = agentLogsCols.map((col: any) => col.name);
    if (!colNames.includes('total_tokens')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN total_tokens INTEGER").run();
      console.log('  ✓ 003_token_cost.sql (total_tokens)');
    }
    if (!colNames.includes('cached_tokens')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN cached_tokens INTEGER").run();
      console.log('  ✓ 003_token_cost.sql (cached_tokens)');
    }
    if (!colNames.includes('thinking_tokens')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN thinking_tokens INTEGER").run();
      console.log('  ✓ 003_token_cost.sql (thinking_tokens)');
    }
    if (!colNames.includes('cost')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN cost REAL").run();
      console.log('  ✓ 003_token_cost.sql (cost)');
    }
    if (!colNames.includes('tokens_estimated')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN tokens_estimated INTEGER DEFAULT 0").run();
      console.log('  ✓ 003_token_cost.sql (tokens_estimated)');
    }
    if (!colNames.includes('billing_source')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN billing_source TEXT").run();
      console.log('  ✓ 003_token_cost.sql (billing_source)');
    }
    if (!colNames.includes('phase_number')) {
      db.prepare("ALTER TABLE agent_logs ADD COLUMN phase_number INTEGER").run();
      console.log('  ✓ 003_token_cost.sql (phase_number)');
    }


    // Migration 013: Add hook score columns to phases table
    const hasHookScore = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'hook_score');
    if (!hasHookScore) {
      db.prepare("ALTER TABLE phases ADD COLUMN hook_score REAL DEFAULT NULL").run();
      db.prepare("ALTER TABLE phases ADD COLUMN hook_score_breakdown TEXT DEFAULT NULL").run();
      db.prepare("ALTER TABLE phases ADD COLUMN hook_score_passed INTEGER DEFAULT NULL").run();
      console.log('  ✓ 013_phases_hook_score');
    }

    // Migration 014: Add story_analyses table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS story_analyses (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        raw_json TEXT NOT NULL,
        overall_retention_score REAL,
        dropout_risk_phases TEXT,
        peak_moment_phase INTEGER,
        summary TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id)
      )
    `).run();
    console.log('  ✓ 014_story_analyses');

    // Migration 015: Add rehook columns to phases table
    const hasRehookRequired = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'rehook_required');
    if (!hasRehookRequired) {
      db.prepare("ALTER TABLE phases ADD COLUMN rehook_required INTEGER DEFAULT 0").run();
      db.prepare("ALTER TABLE phases ADD COLUMN rehook_validated INTEGER DEFAULT NULL").run();
      db.prepare("ALTER TABLE phases ADD COLUMN rehook_type TEXT DEFAULT NULL").run();
      console.log('  ✓ 015_phases_rehook_fields');
    }

    // Migration 016: Add scene_type column to veo_prompts table
    const hasSceneTypeVeoPrompt = (db.prepare("PRAGMA table_info(veo_prompts)").all() as any[]).some((col: any) => col.name === 'scene_type');
    if (!hasSceneTypeVeoPrompt) {
      db.prepare("ALTER TABLE veo_prompts ADD COLUMN scene_type TEXT DEFAULT 'standard'").run();
      console.log('  ✓ 016_veo_prompts_scene_type');
    }

    // Migration 017: Add video_metadata table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS video_metadata (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        raw_json TEXT NOT NULL,
        selected_title TEXT DEFAULT NULL,
        description TEXT,
        chapters TEXT,
        tags TEXT,
        hashtags TEXT,
        thumbnail_hook TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id)
      )
    `).run();
    console.log('  ✓ 017_video_metadata');

    // Migration 018: Add shot_type column to veo_prompts table
    const hasShotTypeVeoPrompt = (db.prepare("PRAGMA table_info(veo_prompts)").all() as any[]).some((col: any) => col.name === 'shot_type');
    if (!hasShotTypeVeoPrompt) {
      db.prepare("ALTER TABLE veo_prompts ADD COLUMN shot_type TEXT DEFAULT NULL").run();
      console.log('  ✓ 018_veo_prompts_shot_type');
    }

    // Migration 020: Add hook_score_borderline column to phases table
    const hasHookScoreBorderline = (db.prepare("PRAGMA table_info(phases)").all() as any[]).some((col: any) => col.name === 'hook_score_borderline');
    if (!hasHookScoreBorderline) {
      db.prepare("ALTER TABLE phases ADD COLUMN hook_score_borderline INTEGER DEFAULT 0").run();
      console.log('  ✓ 020_phases_hook_score_borderline');
    }

    // Migration 023: Add target_duration_minutes to projects
    const hasTargetDuration = (db.prepare("PRAGMA table_info(projects)").all() as any[]).some((col: any) => col.name === 'target_duration_minutes');
    if (!hasTargetDuration) {
      db.prepare("ALTER TABLE projects ADD COLUMN target_duration_minutes INTEGER DEFAULT 8").run();
      console.log('  ✓ 023_projects_target_duration_minutes');
    }

    // Migration 024: Add credibility_reviews table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS credibility_reviews (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        raw_json TEXT NOT NULL,
        overall_credibility_score REAL,
        summary TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id)
      )
    `).run();
    console.log('  ✓ 024_credibility_reviews');

    // Seed default settings if they don't exist
    const insertStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertStmt.run('highway_api_enabled', 'false');
    insertStmt.run('highway_api_key', '');
    insertStmt.run('highway_api_base_url', 'https://api.highwayapi.ai/openai');
    insertStmt.run('highway_api_model', 'claude-fable-5');

    insertStmt.run('gemini_api_key', '');
    insertStmt.run('highway_api_key', '');
    insertStmt.run('local_lm_enabled', 'false');
    insertStmt.run('selected_model', 'gemini-2.5-pro');
    insertStmt.run('gemini_enabled', 'true');
    insertStmt.run('third_party_enabled', 'false');
    insertStmt.run('third_party_base_url', 'https://openrouter.ai/api/v1');
    insertStmt.run('third_party_api_key', '');
    insertStmt.run('third_party_model', '');

    // Migrate old settings if new ones are not set
    try {
      const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'apiKey'").get() as { value: string } | undefined;
      if (apiKeyRow && apiKeyRow.value) {
        db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('gemini_api_key', ?)").run(apiKeyRow.value);
      }
      const modelRow = db.prepare("SELECT value FROM settings WHERE key = 'model'").get() as { value: string } | undefined;
      if (modelRow && modelRow.value) {
        db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('selected_model', ?)").run(modelRow.value);
      }
    } catch (e) {
      // Non-fatal
    }

    // Migrate old settings for Gemini Keys to the new gemini_keys table
    try {
      const keysRow = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKeys' OR key = 'gemini_api_keys' LIMIT 1").get() as { value: string } | undefined;
      if (keysRow && keysRow.value) {
        let keys: string[] = [];
        try {
          keys = JSON.parse(keysRow.value);
        } catch (e) {
          if (!keysRow.value.startsWith('[')) {
            keys = [keysRow.value];
          }
        }
        
        if (Array.isArray(keys)) {
          const crypto = require('crypto');
          const stmt = db.prepare("INSERT OR IGNORE INTO gemini_keys (id, key_value, label, is_active, added_at) VALUES (?, ?, ?, 1, ?)");
          let legacyIndex = 1;
          for (const k of keys) {
            const trimmed = k?.trim();
            if (trimmed) {
               stmt.run(crypto.randomUUID(), trimmed, `Legacy Key ${legacyIndex++}`, Date.now());
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to migrate geminiApiKeys to gemini_keys table:", e);
    }
    // Add status, error_reason, last_checked_at to gemini_keys table if not exists
    try {
      const tableInfo = db.prepare("PRAGMA table_info(gemini_keys)").all() as any[];
      const hasStatus = tableInfo.some((col: any) => col.name === 'status');
      if (!hasStatus) {
        db.prepare("ALTER TABLE gemini_keys ADD COLUMN status TEXT DEFAULT 'active'").run();
        db.prepare("ALTER TABLE gemini_keys ADD COLUMN error_reason TEXT DEFAULT NULL").run();
        db.prepare("ALTER TABLE gemini_keys ADD COLUMN last_checked_at INTEGER DEFAULT NULL").run();
        console.log('  ✓ gemini_keys_resilience_fields');
      }
    } catch (e) {
      console.error("Failed to alter gemini_keys for resilience columns:", e);
    }

    // Bounded one-time backfill migration for content_profile
    try {
      const dbInfo = db.prepare("SELECT COUNT(*) as count FROM projects WHERE content_profile = 'viral_story' AND content_type IN ('documentary', 'presenter')").get() as { count: number };
      if (dbInfo && dbInfo.count > 0) {
        const updateDoc = db.prepare("UPDATE projects SET content_profile = 'documentary' WHERE content_profile = 'viral_story' AND content_type = 'documentary'").run();
        const updatePres = db.prepare("UPDATE projects SET content_profile = 'tutorial' WHERE content_profile = 'viral_story' AND content_type = 'presenter'").run();
        const rowsChanged = updateDoc.changes + updatePres.changes;
        console.log(`  ✓ Backfilled ${rowsChanged} project content_profiles (documentary/tutorial)`);
      } else {
        console.log('  ✓ No legacy project profiles needed backfilling');
      }
    } catch (e: any) {
      console.error("Failed to run backfill migration for content_profile:", e);
    }

  })();

  console.log('Migrations complete.');
}
