---
name: vvs-pipeline-map
description: Architecture reference for VVS Studio's generation pipeline. Use whenever working on any agent, prompt, or generation-stage change to know the agent order, where files live, the Veo field order, and the hard generation constraints — without re-exploring the codebase.
---

# VVS Pipeline Map

## Goal
Give the agent an accurate mental model of VVS Studio so it navigates straight to the right file and respects generation invariants.

## Generation pipeline (in order)
ConceptAgent (+ styleCurator) → StoryPlannerAgent → ProductionBibleAgent → ScriptAgent → SceneAgent → VeoAgent → continuityAgent → runShotDiversityPass → runConnectionReconciliationPass.
- There is NO call to a real Veo API — VeoAgent only produces prompt text.

## Where things live (monorepo)
- `shared/` — TypeScript types + Zod schemas (`shared/src/schemas/`, `shared/src/types/`). Build FIRST.
- `backend/` — Express + SQLite + agents.
  - Agents: `backend/src/agents/` (concept-agent.ts, story-planner-agent.ts, production-bible-agent.ts, script-agent.ts, scene-agent.ts, veo-agent.ts, ...).
  - Prompts: `backend/src/prompts/` (concept.prompt.ts, story-plan.prompt.ts, production-bible.prompt.ts, scene.prompt.ts, veo.prompt.ts).
  - Routes: `backend/src/routes/`. Services: `backend/src/services/`. Repos: `backend/src/db/repositories/`.
- `frontend/` — React + Vite + Tailwind + Zustand (Dashboard.tsx, ProjectSetup.tsx).
- Runtime DB: `backend/data/viral-video-studio.db` (NEVER `backend/database.sqlite`).

## Veo prompt field order (do not reorder)
Prompt# / Visual / Action / Shot / Lens / Lighting / Camera / [In-Clip Transition] / Duration / Ambient Sound / SFX / Avoid / Connection / Narration / Dialogue.

## Hard generation constraints
- Visual description: 40–80 words.
- MAX_WORDS_PER_SCENE = 18 (narration ceiling; over-dense scenes sub-split on ALL paths — never drop narration).
- MAX_SCENES_PER_PHASE = 15 (splitting budget, not a content truncator).
- MAX_CLIPS_PER_SCENE_LIMIT = 5; TARGET_CLIP_LENGTH_SECONDS = 8.
- Scene ↔ veo_prompts is 1:1.
- Phase-plan presets (minutes:phases) = 8:10, 10:12, 15:16, 30:30.

## Config vocabularies
- content_profile modes: viral_story, documentary, tutorial, listicle, narrative_fiction.
- content_type (video structure): auto, narrative, documentary, presenter, montage.
- Documentary rule: character rosters may use anonymous archetypal roles only (never named individuals); peopleless docs stay empty.

## How to use
- Read this before touching a generation stage. Confirm current constants in code (they can be tuned) rather than trusting the numbers above verbatim.