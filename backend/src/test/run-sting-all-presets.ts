import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent } from '../agents/script-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import db from '../db/connection';
import crypto from 'crypto';
import type { ScriptTone } from 'shared';
import { buildPhasePlan, resolveContentProfile } from 'shared';
import { runMigrations } from '../db/migrations/runner';
import { GeminiKeyPool } from '../services/gemini-key-pool';

async function test() {
  console.log('=== RUNNING STING ALL PRESETS TEST ===\n');

  try {
    runMigrations();
  } catch (e) {
    console.error('Migration failed or already run:', e);
  }

  // 1. Reconfigure settings and keys in DB
  console.log('Reconfiguring settings in DB...');
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

  // Reset the key pool's memory state
  GeminiKeyPool.getInstance().syncWithDatabase();

  const projectId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  const topic = 'STING ENERGY DRINK - FACTORY DOCUMENTARY. The high-speed manufacturing process, chemical composition, caffeine/taurine blend, and how it is bottled at 1200 cans per minute.';
  const title = 'STING ENERGY DRINK - FACTORY DOCUMENTARY';
  const visualStyle = 'Industrial Macro-Cinematography';
  const language = 'Hindi';
  const aspectRatio = '16:9';

  console.log(`Setting up project: ${projectId}`);
  
  // Check if project exists, upsert to avoid cascade delete on existing bibles
  const existingProject = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!existingProject) {
    db.prepare(`
      INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, target_duration_minutes)
      VALUES (?, ?, ?, 'setup', ?, ?, ?, 8)
    `).run(projectId, title, topic, visualStyle, language, aspectRatio);
  } else {
    db.prepare(`
      UPDATE projects 
      SET title = ?, topic = ?, status = 'setup', visual_style = ?, narration_language = ?, aspect_ratio = ?, target_duration_minutes = 8
      WHERE id = ?
    `).run(title, topic, visualStyle, language, aspectRatio, projectId);
  }

  // Clear scripts and phases for clean generation, but leave the bibles/plans if we want to reuse them
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);

  const results: any[] = [];

  try {
    let bible: any;
    const existingBible = BibleRepository.findByProjectId(projectId);
    if (existingBible) {
      console.log('Reusing existing Production Bible from DB.');
      bible = JSON.parse(existingBible.raw_json);
    } else {
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
      console.log('Story Plan Outline generated successfully.');

      console.log('\n--- 2. Generating Production Bible ---');
      bible = await productionBibleAgent.run(
        topic,
        visualStyle,
        language,
        aspectRatio,
        projectId,
        undefined,
        'gemini-2.5-pro',
        undefined,
        undefined,
        undefined,
        storyPlan
      );
      console.log('Production Bible generated successfully.');
      // Save it to DB for future reuse
      BibleRepository.createOrUpdate(projectId, bible);
    }

    const scriptTone: ScriptTone = {
      pacing: 5,
      emotional_intensity: 5,
      narration_style: 5,
      target_audience: 'auto',
      hook_regenerate: 'on',
      pre_climax_spike: 'on',
      long_open_loop: 'on',
    };

    const presets = [8, 10, 15, 30];

    for (let idx = 0; idx < presets.length; idx++) {
      const duration = presets[idx];
      if (idx > 0) {
        console.log('\nWaiting 20 seconds to avoid API rate limits...');
        await new Promise(resolve => setTimeout(resolve, 20000));
      }
      console.log(`\n\n--- 3. Running ScriptAgent for target duration: ${duration} minutes ---`);
      
      // Update the database project to use this target duration
      db.prepare("UPDATE projects SET target_duration_minutes = ? WHERE id = ?").run(duration, projectId);

      const project = ProjectRepository.findById(projectId);
      const profile = resolveContentProfile(project?.content_profile || 'viral_story');
      const plan = buildPhasePlan(duration, profile);

      const start = Date.now();
      const scriptData = await scriptAgent.run(
        topic,
        bible,
        projectId,
        undefined,
        'gemini-2.5-pro',
        { temperature: 0.7, target_duration_minutes: duration },
        (chunk) => {
          process.stdout.write(chunk);
        },
        null,
        scriptTone
      );
      const elapsed = Date.now() - start;

      // Save script to DB to mock full flow
      ScriptRepository.createOrUpdate(projectId, scriptData);

      console.log(`\n\n=== VERIFYING PRESET: ${duration} MIN ===`);
      console.log('Actual phase count generated:', scriptData.phases.length, `(Expected: ${plan.phaseCount})`);
      
      const phaseTypes = scriptData.phases.map(p => p.phase_type);
      console.log('Phase sequence:', phaseTypes.join(' -> '));

      const totalWords = scriptData.phases.reduce((acc, p) => {
        const text = p.narration_text || '';
        return acc + text.trim().split(/\s+/).filter(Boolean).length;
      }, 0);

      console.log('Total narration words:', totalWords);
      console.log('Computed total_estimated_duration_minutes:', scriptData.total_estimated_duration_minutes);

      // Verify open loop and rehooks
      const pPlant = scriptData.phases.find(p => p.phase_number === plan.plantPhase);
      const pPayoff = scriptData.phases.find(p => p.phase_number === plan.payoffPhase);
      const rehookMatches = scriptData.phases.filter(p => plan.rehookPhases.includes(p.phase_number));

      console.log(`Open-loop plant: Phase ${plan.plantPhase} is '${pPlant?.open_loop_role}'`);
      console.log(`Open-loop payoff: Phase ${plan.payoffPhase} is '${pPayoff?.open_loop_role}'`);
      console.log(`Rehooks at phases [${plan.rehookPhases.join(', ')}]: found matching phases with rehook types:`, 
        rehookMatches.map(p => `P${p.phase_number}(${p.rehook_type})`).join(', ')
      );

      // Save this result
      results.push({
        preset: duration,
        expectedPhases: plan.phaseCount,
        actualPhases: scriptData.phases.length,
        sequence: phaseTypes,
        totalWords,
        estimatedMinutes: scriptData.total_estimated_duration_minutes,
        elapsedSeconds: Math.round(elapsed / 1000),
        plantRole: pPlant?.open_loop_role,
        payoffRole: pPayoff?.open_loop_role,
        rehookTypes: rehookMatches.map(p => `P${p.phase_number}:${p.rehook_type}`)
      });
    }

    console.log('\n\n=== FINAL RESULTS SUMMARY ===');
    console.table(results.map(r => ({
      'Preset (Min)': r.preset,
      'Exp. Phases': r.expectedPhases,
      'Act. Phases': r.actualPhases,
      'Total Words': r.totalWords,
      'Est. Minutes': r.estimatedMinutes,
      'Elapsed (s)': r.elapsedSeconds,
      'Plant Role': r.plantRole,
      'Payoff Role': r.payoffRole
    })));

  } catch (err: any) {
    console.error('Error during run:', err);
  } finally {
    db.close();
  }
}

test().catch(console.error);
