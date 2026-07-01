---
name: vvs-db-inspect
description: Safely run read-only SQLite queries against the VVS Studio runtime database to inspect projects, phases, scenes, veo prompts, styles, and bibles. Use for debugging data state, verifying generation output, or checking schema.
---

# VVS DB Inspect (read-only)

## Goal
Answer questions about the current data state by querying the runtime SQLite DB, safely and read-only.

## CRITICAL — which database
- The runtime DB is `backend/data/viral-video-studio.db`. ALWAYS use this one.
- `backend/database.sqlite` is STALE — NEVER query or reference it.

## How to query
- Use `better-sqlite3` via a Node one-liner from the project root, e.g.:
  `node -e "const D=require('better-sqlite3');const db=new D('./backend/data/viral-video-studio.db');console.log(db.prepare('SELECT ...').all());"`
- Only SELECT / PRAGMA. Never INSERT, UPDATE, DELETE, ALTER, or DROP with this skill.
- To confirm exact columns, run `PRAGMA table_info('<table>')` before writing a query — do not assume column names.
- Present results as a compact Markdown table. If a query returns > 50 rows, summarize instead of dumping.

## Key tables (confirm columns with PRAGMA before relying on them)
- **projects** — id, title, topic, content_profile, content_type, target_duration_minutes, narration_language, region, style_id, status, concept_brief, created_at, updated_at.
- **phases** — id, project_id, phase_number, phase_title, narration_word_count.
- **scenes** — id, project_id, phase_number, scene_number, title, narration_fragment, narration_word_count, scene_description, continuity_notes, raw_json, veo_prompt_generated.
- **veo_prompts** — project_id, phase_number, scene_number, prompt_number, visual, camera, lighting, connection (+ raw_json for action_arc / transitions). Maps 1:1 with scenes.
- **custom_styles** — id, name, description, render_family.
- **production_bibles** — character_roster, veo_style_tokens, object_registry (in JSON).

## Common checks
- Scene granularity: `SELECT phase_number, COUNT(*) FROM scenes WHERE project_id=? GROUP BY phase_number`.
- Word density: per-scene `narration_word_count` vs scene count.
- Veo mapping: compare veo_prompts count vs scenes count per phase.

## Hard constraints
- Read-only only. No writes, ever.
- Never output secrets (API keys, tokens) if they appear in any row.