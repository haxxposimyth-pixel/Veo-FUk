import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent } from '../agents/script-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import db from '../db/connection';
import crypto from 'crypto';
import type { ScriptTone } from 'shared';

async function test() {
  console.log('=== RUNNING FULL STING ENERGY DRINK SCRIPT GENERATION ===\n');

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

  const projectId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  const topic = 'STING ENERGY DRINK - FACTORY DOCUMENTARY. The high-speed manufacturing process, chemical composition, caffeine/taurine blend, and how it is bottled at 1200 cans per minute.';
  const title = 'STING ENERGY DRINK - FACTORY DOCUMENTARY';
  const visualStyle = 'Industrial Macro-Cinematography';
  const language = 'Hindi';
  const aspectRatio = '16:9';

  console.log(`Setting up project: ${projectId}`);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM story_plans WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, ?, ?, 'setup', ?, ?, ?)
  `).run(projectId, title, topic, visualStyle, language, aspectRatio);

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
    console.log('Story Plan Outline generated successfully.');

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
    console.log('Production Bible generated successfully.');

    console.log('\n--- 3. Running ScriptAgent.run (Two-Stage) ---');
    const startTotal = Date.now();

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
      (chunk) => {
        // Output progress chunk
        process.stdout.write(chunk);
      },
      null, // transcript
      scriptTone
    );

    const endTotal = Date.now();
    console.log(`\n\nScript generated successfully in ${((endTotal - startTotal) / 1000).toFixed(1)}s!`);

    // Save script data to database
    ScriptRepository.createOrUpdate(projectId, scriptData);
    console.log('Saved script to database.');

    // Verify results
    console.log('\n=== VERIFYING RESULTS ===');
    console.log('Total Phases:', scriptData.phases.length);

    const p1 = scriptData.phases.find(p => p.phase_number === 1);
    const p2 = scriptData.phases.find(p => p.phase_number === 2);
    const p9 = scriptData.phases.find(p => p.phase_number === 9);

    console.log('\nOpen-loop role check:');
    console.log(`  Phase 2 role: ${p2?.open_loop_role} (expected: plant)`);
    console.log(`  Phase 9 role: ${p9?.open_loop_role} (expected: payoff)`);

    console.log('\nLanguage check:');
    console.log(`  Phase 1 narration_text: ${p1?.narration_text}`);
    console.log(`  Phase 1 phase_content (should be English): ${p1?.phase_content}`);
    console.log(`  Phase 1 phase_title (should be English): ${p1?.phase_title}`);
    console.log(`  Phase 9 narration_text: ${p9?.narration_text}`);
    console.log(`  Phase 9 phase_content (should be English): ${p9?.phase_content}`);

    console.log('\n=== PHASE 1 DETAILS ===');
    console.log(JSON.stringify(p1, null, 2));

    console.log('\n=== PHASE 9 DETAILS ===');
    console.log(JSON.stringify(p9, null, 2));

  } catch (err: any) {
    console.error('Error in script generation pipeline:', err);
  } finally {
    db.close();
  }
}

test().catch(console.error);
