import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent, applySystemPromptModifications, applyPhasePromptModifications, applyHookBeat3Instructions, optimizedScriptPhaseItemSchema } from '../agents/script-agent';
import db from '../db/connection';
import crypto from 'crypto';
import { runMigrations } from '../db/migrations/runner';

async function test() {
  console.log('=== RUNNING REAL HINDI SCRIPT GENERATION TEST ===\n');
  try {
    runMigrations();
  } catch (e) {}

  const projectId = 'test-hindi-' + crypto.randomUUID().slice(0, 8);
  const topic = 'A day in the life of a local tea stall (Chai Tapri) owner in a busy Indian market street.';
  const visualStyle = 'Cinematic Realism';
  const language = 'Hindi';
  const aspectRatio = '16:9';

  console.log(`Creating project: ${projectId}`);
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, 'Chai Tapri Story', ?, 'setup', ?, ?, ?)
  `).run(projectId, topic, visualStyle, language, aspectRatio);

  try {
    console.log('\n--- 1. Generating Story Plan ---');
    const storyPlan = await storyPlannerAgent.run(
      topic,
      visualStyle,
      language,
      aspectRatio,
      projectId,
      undefined,
      'gemini-2.5-flash'
    );

    console.log('\n--- 2. Generating Production Bible ---');
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

    console.log('\n--- 3. Generating Script (Phase 1) ---');
    // We run the script agent. Since running all 10 phases takes time,
    // let's manually trigger the generation of phase 1 using scriptAgent's internal logic,
    // or run a subset of scriptAgent.run. Let's see if we can generate the first phase.
    const resolvedSettings = await scriptAgent.resolveAutoSettings(
      projectId,
      topic,
      bible,
      undefined,
      'gemini-2.5-flash',
      null,
      undefined
    );

    const {
      target_audience: resolvedAudience,
      hook_regenerate: resolvedHookRegen,
      pre_climax_spike: resolvedPreClimaxSpike,
      long_open_loop: resolvedLongOpenLoop
    } = resolvedSettings;

    // Use the prompts and rules we modified
    const toneDirectives = '';
    const audienceDirectives = '';
    const narrationLanguage = 'Hindi';
    const systemPrompt = applySystemPromptModifications(
      // Import the prompt builder functions
      require('../prompts/script.prompt').getScriptSystemPrompt(toneDirectives, audienceDirectives, narrationLanguage)
    );

    const bibleContextBlock = `Characters: ${JSON.stringify(bible.character_roster)}\nLocations: ${JSON.stringify(bible.location_roster)}\nVisual Style Lock: ${JSON.stringify(bible.visual_style_lock)}`;

    let userPrompt = require('../prompts/script.prompt').getPhaseGenerationPrompt(
      1,
      'hook',
      topic,
      { ...bible, character_roster: [], location_roster: [], visual_style_lock: {} },
      toneDirectives,
      '',
      '',
      [],
      false,
      'none',
      audienceDirectives,
      narrationLanguage
    );

    userPrompt = applyPhasePromptModifications(userPrompt, 1, '');
    userPrompt = applyHookBeat3Instructions(userPrompt);
    userPrompt = userPrompt.replace(
      /Characters:\s*\[\]\r?\nLocations:\s*\[\]\r?\nVisual Style Lock:\s*\{\}/,
      bibleContextBlock
    );

    userPrompt = userPrompt.replace(
      `"viral_hook_rating": number`,
      `"viral_hook_rating": number,
  "key_facts": ["string"],
  "key_images": ["string"],
  "key_events": ["string"],
  "characters_mentioned": ["string"]`
    );

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    console.log('Sending prompt to Gemini...');
    const phaseData = await (scriptAgent as any).generateStructured(
      projectId,
      undefined,
      'gemini-2.5-flash',
      {
        prompt: fullPrompt,
        schema: optimizedScriptPhaseItemSchema,
        temperature: 0.7,
      }
    );

    console.log('\n=== GENERATED PHASE 1 OBJECT ===');
    console.log(JSON.stringify(phaseData, null, 2));

  } catch (err: any) {
    console.error('Error during generation:', err);
  } finally {
    console.log(`\nCleaning up project: ${projectId}`);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
    db.close();
  }
}

test().catch(console.error);
