import assert from 'assert';
import { visualStateSnapshotSchema, strictVisualStateSnapshotSchema, resolveContentProfile } from 'shared';
import { getSceneSystemPrompt, getSceneUserPrompt } from '../prompts/scene.prompt';
import { sceneAgent } from '../agents/scene-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function runVerify() {
  console.log('=== STARTING SCENE DECOMPOSITION VERIFICATION ===\n');

  // ==========================================
  // PART A: NON-REGRESSION CHECKS
  // ==========================================
  console.log('--- PART A: Non-Regression & Schema Backward Compatibility ---');

  // 1. Parse legacy snapshot with new schema
  const legacySnapshot = {
    characters_present: [
      {
        character_id: 'CHAR_001',
        current_position: 'standing left',
        props_held: ['keys'],
        physical_condition: 'healthy',
        facing_direction: 'facing front'
      }
    ],
    location_state: 'same',
    time_of_day: 'day',
    weather_or_atmosphere: 'cloudy',
    key_objects_visible: ['OBJ_001']
  };

  const parsed = visualStateSnapshotSchema.parse(legacySnapshot);
  assert.ok(parsed, 'Legacy snapshot should parse successfully');
  assert.deepStrictEqual(parsed.character_damage, {}, 'Should populate default empty character_damage');
  assert.deepStrictEqual(parsed.costume_armor_state, {}, 'Should populate default empty costume_armor_state');
  assert.deepStrictEqual(parsed.creature_states, [], 'Should populate default empty creature_states');
  assert.strictEqual(parsed.environmental_destruction, '', 'Should populate default empty environmental_destruction');
  console.log('✓ Legacy snapshot parsing compatibility check passed.');

  // 2. Strict Visual State Snapshot Legacy Schema Compatibility
  const legacyStrictSnapshot = {
    characters_present: [
      {
        name: 'Sarah',
        position: 'standing left',
        props: ['keys'],
        physical_condition: 'healthy',
        facing_direction: 'facing front'
      }
    ],
    location_state: 'same',
    time_of_day: 'day',
    atmosphere: 'cloudy',
    key_visible_objects: ['OBJ_001']
  };
  const parsedStrict = strictVisualStateSnapshotSchema.parse(legacyStrictSnapshot);
  assert.ok(parsedStrict, 'Legacy strict snapshot should parse successfully');
  assert.deepStrictEqual(parsedStrict.character_damage, {}, 'Should populate default empty character_damage');
  assert.deepStrictEqual(parsedStrict.creature_states, [], 'Should populate default empty creature_states');
  console.log('✓ Legacy strict snapshot parsing compatibility check passed.');

  // 3. Prompt Parity for non-cinematic profile
  const topicDummy = 'Test Topic';
  const bibleDummy: any = {
    character_roster: [{ id: 'CHAR_001', name: 'Sarah' }],
    location_roster: [],
    object_registry: []
  };
  const phaseDummy: any = {
    phase_number: 1,
    phase_title: 'Hook',
    phase_type: 'hook',
    phase_content: 'Sarah walks in.'
  };

  const system1 = getSceneSystemPrompt('English', undefined);
  const system2 = getSceneSystemPrompt('English', resolveContentProfile('documentary'));
  assert.ok(!system1.includes('character_damage'), 'Non-cinematic system prompt must not contain character_damage');
  assert.ok(!system2.includes('character_damage'), 'Documentary system prompt must not contain character_damage');

  const user1 = getSceneUserPrompt(phaseDummy, bibleDummy, undefined, undefined);
  const user2 = getSceneUserPrompt(phaseDummy, bibleDummy, undefined, resolveContentProfile('documentary'));
  assert.ok(!user1.includes('character_damage'), 'Non-cinematic user prompt must not contain character_damage');
  assert.ok(!user2.includes('character_damage'), 'Documentary user prompt must not contain character_damage');

  console.log('✓ Non-regression prompt checks passed.\n');

  // ==========================================
  // PART B: CINEMATIC EXECUTION
  // ==========================================
  console.log('--- PART B: Cinematic Scene Decomposition ---');

  // Setup keys
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

  const projectId = 'test_cinematic_scene_proj';
  const phaseId = 'test_cinematic_scene_phase';
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);

  // Setup project in DB with cinematic profile
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
    VALUES (?, 'Cinematic Vance', 'Vance escapes Syndicate', 'script', 'Cinematic', 'English', '16:9', 'narrative', 'cinematic_series')
  `).run(projectId);

  const cinematicBible: any = {
    character_roster: [
      {
        id: 'CHAR_001',
        name: 'Vance',
        role: 'Protagonist',
        physical_description: 'Tough data scavenger in leather jacket'
      },
      {
        id: 'CHAR_002',
        name: 'Nano-Stalker',
        role: 'Creature',
        character_type: 'creature',
        physical_description: 'Predatory mechanical panther with glowing red eyes'
      }
    ],
    location_roster: [
      {
        id: 'LOC_001',
        name: 'Neo-Detroit Alleyway',
        type: 'exterior',
        atmosphere: 'grimy and neon-lit'
      }
    ],
    object_registry: [
      {
        id: 'OBJ_001',
        name: 'Data-Spike',
        description: 'Glowing datadrive weapon'
      }
    ]
  };

  const cinematicPhase: any = {
    id: phaseId,
    project_id: projectId,
    phase_number: 1,
    phase_title: 'The Stalker Lurks',
    phase_type: 'hook',
    phase_content: 'Vance runs down the rain-slicked alleyway. Suddenly, the Nano-Stalker pounces from the shadows, its red eyes glowing. Vance swings his Data-Spike, cracking the creature\'s faceplate, but the creature slashes Vance\'s arm, tearing his jacket and causing debris to crumble from the neon sign above.',
    narration_text: 'I ran through the rain. I thought I was alone. But the Syndicate\'s pet was waiting. It drew first blood.',
    location_id_primary: 'LOC_001'
  };

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_title, phase_type, phase_content, narration_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(phaseId, projectId, 1, cinematicPhase.phase_title, cinematicPhase.phase_type, cinematicPhase.phase_content, cinematicPhase.narration_text);

  console.log('Running scene agent run for cinematic phase...');
  const breakdown = await sceneAgent.run(
    cinematicPhase,
    cinematicBible,
    projectId,
    1,
    3,
    undefined,
    'gemini-2.5-flash'
  );

  console.log(`Decomposed into ${breakdown.scenes.length} scenes.`);
  assert.ok(breakdown.scenes.length > 0, 'Should generate at least 1 scene');

  console.log('\n--- VERIFYING CINEMATIC SNAPSHOT FIELDS ---');
  let foundCharacterDamage = false;
  let foundCostumeArmorState = false;
  let foundCreatureStates = false;
  let foundEnvironmentalDestruction = false;

  for (const scene of breakdown.scenes) {
    console.log(`\nScene ${scene.scene_number}: ${scene.title}`);
    console.log(`Description: ${scene.scene_description}`);
    console.log(`Snapshot: ${JSON.stringify(scene.visual_state_snapshot, null, 2)}`);

    const snapshot = scene.visual_state_snapshot;
    if (snapshot) {
      if (snapshot.character_damage && Object.keys(snapshot.character_damage).length > 0) {
        foundCharacterDamage = true;
      }
      if (snapshot.costume_armor_state && Object.keys(snapshot.costume_armor_state).length > 0) {
        foundCostumeArmorState = true;
      }
      if (snapshot.creature_states && snapshot.creature_states.length > 0) {
        foundCreatureStates = true;
      }
      if (snapshot.environmental_destruction && snapshot.environmental_destruction.trim().length > 0) {
        foundEnvironmentalDestruction = true;
      }
    }
  }

  console.log('\nResults Checklist:');
  console.log(`- Character damage populated: ${foundCharacterDamage}`);
  console.log(`- Costume/armor state populated: ${foundCostumeArmorState}`);
  console.log(`- Creature states populated: ${foundCreatureStates}`);
  console.log(`- Environmental destruction populated: ${foundEnvironmentalDestruction}`);

  assert.ok(foundCharacterDamage || foundCostumeArmorState || foundCreatureStates || foundEnvironmentalDestruction, 'At least one cinematic continuity field should be populated during action/combat');

  console.log('\n=== SCENE DECOMPOSITION VERIFICATION PASSED ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
