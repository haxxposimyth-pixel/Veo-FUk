import assert from 'assert';
import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent } from '../agents/script-agent';
import { hookScorerAgent } from '../agents/hook-scorer-agent';
import { storyAnalyzerAgent } from '../agents/story-analyzer-agent';
import { getStoryPlanUserPrompt } from '../prompts/story-plan.prompt';
import { getScriptSystemPrompt, getNarrationSpinePrompt, getOutlinePrompt, getNarrationFillPrompt, getPhaseExpansionPrompt, getPhaseRegeneratePrompt } from '../prompts/script.prompt';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import db from '../db/connection';
import crypto from 'crypto';
import type { ScriptTone } from 'shared';
import { resolveContentProfile, buildPhasePlan } from 'shared';

async function runVerify() {
  console.log('=== STARTING SCRIPT PIPELINE VERIFICATION ===\n');

  // ==========================================
  // PART A: NON-REGRESSION CHECKS
  // ==========================================
  console.log('--- PART A: Non-Regression Prompt Parity Checks ---');

  const topicDummy = 'Test Topic';
  const styleDummy = 'Anime Explainer';
  const langDummy = 'English';
  const ratioDummy = '16:9';
  const profileDoc = resolveContentProfile('documentary');
  const planDummy = buildPhasePlan(8, profileDoc);
  const bibleDummy: any = {
    visual_style_lock: { color_mood: 'moody', lighting_style: 'dark' },
    character_roster: [],
    location_roster: [],
    object_registry: []
  };

  // 1. Story Plan prompt parity
  const pPlanDoc = getStoryPlanUserPrompt(topicDummy, styleDummy, langDummy, ratioDummy, undefined, 'auto', undefined, profileDoc);
  assert.ok(!pPlanDoc.includes('Estimated Runtime MUST match the target duration'), 'Non-cinematic story plan prompt must not contain cinematic instructions');
  const pPlanCinematic = getStoryPlanUserPrompt(topicDummy, styleDummy, langDummy, ratioDummy, undefined, 'auto', undefined, resolveContentProfile('cinematic_series'), undefined, 12);
  assert.ok(pPlanCinematic.includes('Estimated Runtime MUST match the target duration of 12 minutes'), 'Cinematic story plan prompt must contain cinematic target duration instructions');

  // 2. Script System Prompt parity
  const pSys1 = getScriptSystemPrompt('Tone details', 'Audience details', 'English');
  const pSys2 = getScriptSystemPrompt('Tone details', 'Audience details', 'English', 'documentary');
  assert.strictEqual(pSys1, pSys2, 'Script system prompt must be identical for non-cinematic profile');

  // 3. Narration Spine Prompt parity
  const pSpine1 = getNarrationSpinePrompt(topicDummy, bibleDummy, 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  }, planDummy);
  const pSpine2 = getNarrationSpinePrompt(topicDummy, bibleDummy, 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  }, planDummy, undefined, 'documentary');
  assert.strictEqual(pSpine1, pSpine2, 'Narration spine prompt must be identical for non-cinematic profile');

  // 4. Outline Prompt parity
  const pOutline1 = getOutlinePrompt(planDummy, topicDummy, bibleDummy, 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  });
  const pOutline2 = getOutlinePrompt(planDummy, topicDummy, bibleDummy, 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  }, 'documentary');
  assert.strictEqual(pOutline1, pOutline2, 'Outline prompt must be identical for non-cinematic profile');

  // 5. Narration Fill Prompt parity
  const pFill1 = getNarrationFillPrompt(planDummy, { title: 'T', phases: [] }, [1, 2], 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  });
  const pFill2 = getNarrationFillPrompt(planDummy, { title: 'T', phases: [] }, [1, 2], 'English', 'Tone', 'Audience', {
    hook_regenerate: 'off',
    pre_climax_spike: 'off',
    long_open_loop: 'off',
    target_audience: 'general'
  }, 'documentary');
  assert.strictEqual(pFill1, pFill2, 'Narration fill prompt must be identical for non-cinematic profile');

  // 6. Phase Expansion Prompt parity
  const pExp1 = getPhaseExpansionPrompt({ phase_number: 1, phase_type: 'hook', phase_title: 'Title', narration_text: 'Narration', rehook_type: null, open_loop_role: 'none' }, 'All phases', 'Bible context', 'English');
  const pExp2 = getPhaseExpansionPrompt({ phase_number: 1, phase_type: 'hook', phase_title: 'Title', narration_text: 'Narration', rehook_type: null, open_loop_role: 'none' }, 'All phases', 'Bible context', 'English', 'documentary');
  assert.strictEqual(pExp1, pExp2, 'Phase expansion prompt must be identical for non-cinematic profile');

  // 7. Phase Regenerate Prompt parity
  const pRegen1 = getPhaseRegeneratePrompt(1, 'Title', 'Current content', topicDummy, bibleDummy, undefined, undefined, undefined, false, 'none', undefined, 'English', [4, 6, 8]);
  const pRegen2 = getPhaseRegeneratePrompt(1, 'Title', 'Current content', topicDummy, bibleDummy, undefined, undefined, undefined, false, 'none', undefined, 'English', [4, 6, 8], 'documentary');
  assert.strictEqual(pRegen1, pRegen2, 'Phase regenerate prompt must be identical for non-cinematic profile');

  console.log('✓ Non-regression prompt parity checks passed successfully.\n');

  // ==========================================
  // PART B: CINEMATIC VERIFICATION
  // ==========================================
  console.log('--- PART B: Cinematic Script Generation Verification ---');

  // Configure active key in DB
  const activeKey = process.env.GEMINI_API_KEY || 'DUMMY_KEY';
  SettingsRepository.saveSettings({
    model: 'gemini-2.5-pro',
    geminiApiKey: activeKey,
    geminiApiKeys: [activeKey]
  });

  db.prepare("DELETE FROM gemini_keys").run();
  db.prepare(`
    INSERT INTO gemini_keys (id, key_value, label, is_active, status, added_at)
    VALUES (?, ?, ?, 1, 'active', ?)
  `).run(crypto.randomUUID(), activeKey, 'Sting Test Key', Date.now());
  db.prepare("DELETE FROM key_model_quota").run();

  const projectId = 'test_cinematic_project_id';
  const topic = 'Sci-Fi Noir: Vance escape from Neo-Detroit';
  const title = 'Vance Escape';
  const visualStyle = 'photoreal_cinematic';
  const language = 'English';
  const aspectRatio = '16:9';

  console.log(`Setting up cinematic project: ${projectId}`);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM story_plans WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);

  const movieConfig = {
    format: 'single_movie',
    genre: 'Sci-Fi Noir',
    tone: ['atmospheric', 'suspenseful'],
    story_engine_focus: { combat: true, world_exploration: true, monster_action: true, hero_journey: true, season_continuity: true },
    hero_idea: 'Vance, a rogue technician in a neon-drenched cityscape.',
    villain_idea: 'The Obsidian Syndicate, a megacorporation using digital monsters.',
    world_idea: 'Neo-Detroit, a rain-slicked city bathed in neon.',
    creature_idea: 'Nano-Stalker, a predatory mechanical panther.'
  };

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile, movie_config, target_duration_minutes)
    VALUES (?, ?, ?, 'setup', ?, ?, ?, 'narrative', 'cinematic_series', ?, 12)
  `).run(projectId, title, topic, visualStyle, language, aspectRatio, JSON.stringify(movieConfig));

  console.log('\nGenerating Cinematic Story Plan...');
  const storyPlan = await storyPlannerAgent.run(
    topic,
    visualStyle,
    language,
    aspectRatio,
    projectId,
    undefined,
    'gemini-2.5-flash',
    undefined,
    undefined,
    undefined,
    'narrative',
    undefined,
    'cinematic_series'
  );

  console.log('Grounding check: target_duration_minutes = 12');
  console.log(`Story Plan estimated_runtime: ${storyPlan.raw_json?.estimated_runtime}`);
  console.log(`Story Plan scene_count: ${storyPlan.raw_json?.scene_count}`);
  assert.ok(storyPlan.raw_json?.estimated_runtime, 'Should have estimated_runtime');
  assert.ok(storyPlan.raw_json?.scene_count, 'Should have scene_count');

  console.log('\nGenerating Cinematic Production Bible...');
  const bible = await productionBibleAgent.run(
    topic,
    visualStyle,
    language,
    aspectRatio,
    projectId,
    undefined,
    'gemini-2.5-flash',
    undefined,
    undefined,
    undefined,
    storyPlan
  );

  console.log('\nGenerating Cinematic Script...');
  const scriptTone: ScriptTone = {
    pacing: 5,
    emotional_intensity: 5,
    narration_style: 5,
    target_audience: 'auto',
    hook_regenerate: 'on',
    pre_climax_spike: 'on',
    long_open_loop: 'on',
  };

  const scriptData = await scriptAgent.run(
    topic,
    bible,
    projectId,
    undefined,
    'gemini-2.5-pro',
    { temperature: 0.7 },
    undefined,
    undefined,
    scriptTone
  );

  console.log(`Cinematic script generated with ${scriptData.phases.length} phases.`);
  const phase1 = scriptData.phases.find(p => p.phase_number === 1);
  console.log(`\n--- PHASE 1 VERBATIM ---`);
  console.log(`Title: ${phase1?.phase_title}`);
  console.log(`Narration: ${phase1?.narration_text}`);
  console.log(`Hook rating: ${phase1?.viral_hook_rating}`);
  console.log(`Visual details: ${phase1?.phase_content}`);
  console.log(`------------------------`);

  // Verify that it contains Vance and Nano-Stalker
  assert.ok(phase1, 'Should have Phase 1');
  const lowerNarration = (phase1.narration_text || '').toLowerCase();
  const lowerContent = (phase1.phase_content || '').toLowerCase();
  assert.ok(
    lowerNarration.includes('vance') || lowerContent.includes('vance') ||
    lowerNarration.includes('stalker') || lowerContent.includes('stalker'),
    'Should refer to bible entities (Vance or Stalker)'
  );

  console.log('\nScoring Cinematic Hook with HookScorerAgent...');
  const hookScore = await hookScorerAgent.run(projectId, phase1.narration_text, undefined, 'gemini-2.5-flash');
  console.log(`Hook Scorer overall score: ${hookScore.overall}`);
  console.log(`Hook Scorer feedback: ${hookScore.feedback}`);
  console.log(`Hook Scorer suggestions: ${JSON.stringify(hookScore.suggestions)}`);
  assert.ok(hookScore.overall >= 1, 'Should return a valid overall score');

  console.log('\nRunning StoryAnalyzerAgent on the full script...');
  const analysis = await storyAnalyzerAgent.analyze(
    projectId,
    scriptData.phases.map(p => ({ phase_number: p.phase_number, phase_title: p.phase_title, narration_text: p.narration_text })),
    undefined,
    'gemini-2.5-flash'
  );
  console.log(`Story Analyzer overall retention: ${analysis.overall_retention_score}`);
  console.log(`Story Analyzer peak moment phase: ${analysis.peak_moment_phase}`);
  console.log(`Story Analyzer summary: ${analysis.summary}`);
  assert.ok(analysis.overall_retention_score >= 1, 'Should return overall retention score');

  console.log('\n=== CINEMATIC SCRIPT PIPELINE VERIFICATION PASSED ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
