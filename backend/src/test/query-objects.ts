import db from '../db/connection';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { veoAgent } from '../agents/veo-agent';
import { ProjectRepository } from '../db/repositories/project.repo';

async function verifyBranding() {
  db.exec('PRAGMA foreign_keys = OFF;');
  console.log('==================================================');
  console.log('    RUNNING BRANDED HERO PRODUCT VERIFICATION     ');
  console.log('==================================================\n');

  const settings = SettingsRepository.getSettings();
  const apiKey = settings.apiKey || '';
  if (!apiKey) {
    console.error('ERROR: No Gemini API Key configured in Settings!');
    db.close();
    return;
  }
  console.log(`Using API Key: ${apiKey.substring(0, 10)}...`);

  // ==========================================
  // CASE A: Sting Energy Drink Project
  // ==========================================
  console.log('\n--------------------------------------------------');
  console.log('CASE A: STING ENERGY DRINK PROJECT');
  console.log('--------------------------------------------------');

  const stingId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  const stingTopic = 'STING ENERGY DRINK - FACTORY DOCUMENTARY. The high-speed manufacturing process, chemical composition, caffeine/taurine blend, and how it is bottled at 1200 cans per minute.';
  const stingTitle = 'STING ENERGY DRINK - FACTORY DOCUMENTARY';
  const stingStyle = 'Industrial Macro-Cinematography';
  const stingLang = 'English';
  const stingRatio = '16:9';

  // Ensure project exists in DB
  const existingSting = ProjectRepository.findById(stingId);
  if (!existingSting) {
    db.prepare(`
      INSERT OR REPLACE INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
      VALUES (?, ?, ?, 'setup', ?, ?, ?)
    `).run(stingId, stingTitle, stingTopic, stingStyle, stingLang, stingRatio);
  }

  // 1. Generate bible
  console.log('Generating Production Bible for Sting project...');
  const stingBibleData = await productionBibleAgent.run(
    stingTopic,
    stingStyle,
    stingLang,
    stingRatio,
    stingId,
    apiKey,
    'gemini-2.5-flash',
    undefined,
    undefined,
    undefined,
    undefined
  );

  console.log('\nSting Bible Object Registry Hero Entry Check:');
  const heroObj = (stingBibleData.object_registry || []).find((o: any) => o.is_hero_prop);
  if (heroObj) {
    console.log(`Hero Object ID: ${heroObj.id}`);
    console.log(`Hero Object Name: ${heroObj.name}`);
    console.log(`is_branded_product: ${heroObj.is_branded_product}`);
    console.log(`visual_lock: ${heroObj.visual_lock}`);
    console.log(`description: ${heroObj.description}`);
  } else {
    console.log('WARNING: No hero prop object found in Sting bible!');
  }

  // Save bible to DB
  BibleRepository.createOrUpdate(stingId, stingBibleData);

  // 2. Test Veo prompt avoid list for Sting project
  const mockSceneId1 = 'mock-scene-branded';
  const mockSceneId2 = 'mock-scene-generic';

  const mockSceneBranded = {
    id: mockSceneId1,
    project_id: stingId,
    phase_id: 'phase-1',
    phase_number: 1,
    scene_number: 1,
    title: 'Sting Can Close-Up',
    scene_description: 'An extreme close-up of a Sting energy drink can.',
    continuity_notes: 'scene_type: action',
    narration_fragment: 'Behold the energy of Sting.',
    status: 'done',
    raw_json: JSON.stringify({
      object_ids_featured: [heroObj ? heroObj.id : 'OBJ_001'],
      visual_state_snapshot: { time_of_day: 'afternoon' }
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const mockSceneGeneric = {
    id: mockSceneId2,
    project_id: stingId,
    phase_id: 'phase-1',
    phase_number: 1,
    scene_number: 2,
    title: 'Factory Assembly Line',
    scene_description: 'A wide shot of the factory machines running.',
    continuity_notes: 'scene_type: action',
    narration_fragment: 'The high speed conveyor belts move rapidly.',
    status: 'done',
    raw_json: JSON.stringify({
      object_ids_featured: [], // no branded object
      visual_state_snapshot: { time_of_day: 'afternoon' }
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.prepare('INSERT OR REPLACE INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    mockSceneBranded.id, mockSceneBranded.project_id, mockSceneBranded.phase_id, mockSceneBranded.phase_number, mockSceneBranded.scene_number, mockSceneBranded.title, mockSceneBranded.scene_description, mockSceneBranded.continuity_notes, mockSceneBranded.narration_fragment, mockSceneBranded.status, mockSceneBranded.raw_json
  );

  db.prepare('INSERT OR REPLACE INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    mockSceneGeneric.id, mockSceneGeneric.project_id, mockSceneGeneric.phase_id, mockSceneGeneric.phase_number, mockSceneGeneric.scene_number, mockSceneGeneric.title, mockSceneGeneric.scene_description, mockSceneGeneric.continuity_notes, mockSceneGeneric.narration_fragment, mockSceneGeneric.status, mockSceneGeneric.raw_json
  );

  const stingProj = ProjectRepository.findById(stingId);
  console.log('\nGenerating Veo prompt for branded scene...');
  const promptBranded = await veoAgent.run(
    mockSceneBranded,
    stingProj,
    stingBibleData,
    stingId,
    1,
    1,
    undefined,
    'gemini-2.5-flash'
  );

  console.log('Generating Veo prompt for generic background scene...');
  const promptGeneric = await veoAgent.run(
    mockSceneGeneric,
    stingProj,
    stingBibleData,
    stingId,
    1,
    2,
    undefined,
    'gemini-2.5-flash'
  );

  console.log('\n--- AVOID LIST COMPARISON (STING PROJECT) ---');
  console.log(`Branded Scene Avoid List: "${promptBranded.avoid}"`);
  console.log(`Generic Scene Avoid List: "${promptGeneric.avoid}"`);

  // Clean up mock scenes
  db.prepare('DELETE FROM scenes WHERE id IN (?, ?)').run(mockSceneId1, mockSceneId2);

  // ==========================================
  // CASE B: Container Ship Project
  // ==========================================
  console.log('\n--------------------------------------------------');
  console.log('CASE B: CONTAINER SHIP PROJECT');
  console.log('--------------------------------------------------');

  const shipId = '645be835-1b5e-4026-9cb8-8312af2477c3';
  const shipProj = ProjectRepository.findById(shipId);
  if (!shipProj) {
    console.error('ERROR: Container Ship project not found in DB!');
    db.close();
    return;
  }

  console.log('Generating Production Bible for Container Ship project...');
  const shipBibleData = await productionBibleAgent.run(
    shipProj.topic,
    shipProj.visual_style,
    shipProj.narration_language || 'English',
    shipProj.aspect_ratio || '16:9',
    shipId,
    apiKey,
    'gemini-2.5-flash',
    undefined,
    undefined,
    undefined,
    undefined
  );

  console.log('\nContainer Ship Bible Object Registry Hero Entry Check:');
  const shipHeroObj = (shipBibleData.object_registry || []).find((o: any) => o.is_hero_prop);
  if (shipHeroObj) {
    console.log(`Hero Object ID: ${shipHeroObj.id}`);
    console.log(`Hero Object Name: ${shipHeroObj.name}`);
    console.log(`is_branded_product: ${shipHeroObj.is_branded_product}`);
    console.log(`visual_lock: ${shipHeroObj.visual_lock}`);
    console.log(`description: ${shipHeroObj.description}`);
  } else {
    console.log('WARNING: No hero prop object found in Ship bible!');
  }

  // Save ship bible to DB
  BibleRepository.createOrUpdate(shipId, shipBibleData);

  // Mock scene and prompt for Ship project
  const mockShipSceneId = 'mock-scene-ship';
  const mockShipScene = {
    id: mockShipSceneId,
    project_id: shipId,
    phase_id: 'phase-1',
    phase_number: 1,
    scene_number: 1,
    title: 'Container Ship Docking',
    scene_description: 'A massive container ship docking at the harbor.',
    continuity_notes: 'scene_type: action',
    narration_fragment: 'The container ship docks slowly.',
    status: 'done',
    raw_json: JSON.stringify({
      object_ids_featured: [shipHeroObj ? shipHeroObj.id : 'OBJ_001'],
      visual_state_snapshot: { time_of_day: 'morning' }
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.prepare('INSERT OR REPLACE INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    mockShipScene.id, mockShipScene.project_id, mockShipScene.phase_id, mockShipScene.phase_number, mockShipScene.scene_number, mockShipScene.title, mockShipScene.scene_description, mockShipScene.continuity_notes, mockShipScene.narration_fragment, mockShipScene.status, mockShipScene.raw_json
  );

  console.log('\nGenerating Veo prompt for Ship scene...');
  const promptShip = await veoAgent.run(
    mockShipScene,
    shipProj,
    shipBibleData,
    shipId,
    1,
    1,
    undefined,
    'gemini-2.5-flash'
  );

  console.log('\n--- AVOID LIST (SHIP PROJECT) ---');
  console.log(`Ship Scene Avoid List: "${promptShip.avoid}"`);

  // Clean up mock ship scene
  db.prepare('DELETE FROM scenes WHERE id = ?').run(mockShipSceneId);

  db.close();
  console.log('\nVerification complete!');
}

verifyBranding().catch(console.error);
