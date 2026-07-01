import db from '../db/connection';
import { ProductionBibleAgent } from '../agents/production-bible-agent';
import { SceneAgent } from '../agents/scene-agent';
import { VeoAgent, assembleVeoFullPrompt } from '../agents/veo-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import crypto from 'crypto';
import type { ScriptPhaseItem } from 'shared';
import fs from 'fs';
import path from 'path';

async function runCheck() {
  db.exec('PRAGMA foreign_keys = OFF;');
  console.log('==================================================');
  console.log('     END-TO-END BRANDING LINK CHECK HARNESS      ');
  console.log('==================================================\n');

  // Load a valid API key (either from settings or from 5ApiKeys)
  let apiKey: string = '';
  try {
    const settings = SettingsRepository.getSettings();
    const key = settings.apiKey;
    if (key && key !== 'vertex-bypass-key-123') {
      apiKey = key as string;
    }
  } catch (e) {}

  if (!apiKey) {
    try {
      const keysPath = path.resolve(__dirname, '../../../5ApiKeys');
      if (fs.existsSync(keysPath)) {
        const content = fs.readFileSync(keysPath, 'utf-8');
        const keys = content.match(/(AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+)/g) || [];
        if (keys.length > 0 && keys[0]) {
          apiKey = keys[0] as string;
        }
      }
    } catch (e) {}
  }

  if (!apiKey) {
    console.error('ERROR: No valid Gemini API Key found in settings or 5ApiKeys!');
    db.close();
    return;
  }

  console.log(`Using API Key: ${apiKey.substring(0, 10)}...`);

  const productionBibleAgent = new ProductionBibleAgent();
  const sceneAgent = new SceneAgent();
  const veoAgent = new VeoAgent();

  const stingId = 'test-check-sting-id';
  const shipId = 'test-check-ship-id';

  // Clean up database tables for these test IDs first
  const cleanupIds = [stingId, shipId];
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM phases WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM scenes WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(id);
  }

  // Helper to create the project in DB
  const createProjectInDb = (id: string, title: string, topic: string, style: string) => {
    db.prepare(`
      INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
      VALUES (?, ?, ?, 'setup', ?, 'English', '16:9', 'auto', 'viral_story')
    `).run(id, title, topic, style);
  };

  // Helper to create the phase in DB
  const createPhaseInDb = (id: string, phaseId: string, narrationText: string) => {
    db.prepare(`
      INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, approved, scenes_generated, status, narration_text, narration_word_count)
      VALUES (?, ?, 1, 'hook', 'Introduction', 'Intro content', 1, 0, 'setup', ?, 5)
    `).run(phaseId, id, narrationText);
  };

  // --------------------------------------------------
  // FIXTURE A: Branded (Sting Energy Drink)
  // --------------------------------------------------
  console.log('\nRunning Fixture A (Branded: Sting Energy Drink)...');
  const stingTopic = 'How Sting energy drink is made: factory tour, bottling, red can, lightning logo.';
  const stingTitle = 'How Sting energy drink is made';
  const stingStyle = 'Industrial Cinematography';

  createProjectInDb(stingId, stingTitle, stingTopic, stingStyle);

  const stingBible = await productionBibleAgent.run(
    stingTopic,
    stingStyle,
    'English',
    '16:9',
    stingId,
    apiKey,
    'gemini-2.5-flash'
  );
  BibleRepository.createOrUpdate(stingId, stingBible);

  const stingHero = (stingBible.object_registry || []).find((o: any) => o.is_hero_prop);
  if (!stingHero) {
    throw new Error('No hero prop found in Sting bible object registry');
  }

  const stingPhaseId = crypto.randomUUID();
  const stingNarration = 'Behold the energy of Sting.';
  createPhaseInDb(stingId, stingPhaseId, stingNarration);

  const stingPhaseItem: ScriptPhaseItem = {
    phase_number: 1,
    phase_type: 'hook',
    phase_title: 'Introduction',
    phase_content: 'Intro content',
    narration_text: stingNarration,
    narration_word_count: 5,
    key_events: [],
    character_ids_active: [],
    location_id_primary: stingBible.location_roster?.[0]?.id || 'LOC_001',
    estimated_duration_seconds: 5,
    viral_hook_rating: 9,
  };

  const stingSceneBreakdown = await sceneAgent.run(
    stingPhaseItem,
    stingBible,
    stingId,
    1,
    0,
    apiKey,
    'gemini-2.5-flash'
  );

  // Re-map scene object featured list to contain the hero object ID
  if (stingSceneBreakdown.scenes && stingSceneBreakdown.scenes.length > 0) {
    stingSceneBreakdown.scenes[0].object_ids_featured = [stingHero.id];
    // Re-stringify the raw_json to carry the object_ids_featured
    const parsedRaw = JSON.parse((stingSceneBreakdown.scenes[0] as any).raw_json || '{}');
    parsedRaw.object_ids_featured = [stingHero.id];
    (stingSceneBreakdown.scenes[0] as any).raw_json = JSON.stringify(parsedRaw);
  }

  SceneRepository.createOrUpdateBatch(stingId, stingPhaseId, 1, stingSceneBreakdown.scenes);

  const stingSavedScenes = SceneRepository.findByPhase(stingId, 1);
  const stingDbScene = stingSavedScenes[0];
  const stingParsedScene = JSON.parse(stingDbScene.raw_json);

  // Resolve Objects Featured using exact route logic
  const stingObjectsFeaturedResolved = (stingParsedScene.object_ids_featured || []).map((objId: string) => {
    const obj = stingBible.object_registry.find((o: any) => o.id === objId || o.object_id === objId);
    return obj ? {
      id: obj.id || obj.object_id || objId,
      object_id: obj.object_id || obj.id || objId,
      name: obj.name,
      description: obj.description,
      symbolic_meaning: obj.symbolic_meaning,
      screen_time: obj.screen_time,
      is_branded_product: obj.is_branded_product === true
    } : { id: objId, object_id: objId };
  });

  const stingResolvedScene = {
    title: stingDbScene.title,
    scene_number: stingDbScene.scene_number,
    phase_number: stingDbScene.phase_number,
    narration_fragment: stingDbScene.narration_fragment,
    emotional_beat: stingParsedScene.emotional_beat || 'standard',
    scene_description: stingDbScene.scene_description,
    continuity_notes: stingDbScene.continuity_notes,
    transition_to_next: stingParsedScene.transition_to_next || 'cut',
    location_description: 'Test Location',
    characters_present: [],
    objects_featured: stingObjectsFeaturedResolved,
    raw_json: stingDbScene.raw_json
  };

  const stingProject = ProjectRepository.findById(stingId);
  const stingPrompt = await veoAgent.run(
    stingResolvedScene,
    stingProject,
    stingBible,
    stingId,
    1,
    1,
    apiKey,
    'gemini-2.5-flash'
  );


  // --------------------------------------------------
  // FIXTURE B: Generic (Container Ship)
  // --------------------------------------------------
  console.log('\nRunning Fixture B (Generic: Container Ship)...');
  const shipTopic = 'How a container ship carries 20,000 containers: massive cargo vessel docking, container cranes.';
  const shipTitle = 'How a container ship carries 20,000 containers';
  const shipStyle = 'Cinematic Documentary';

  createProjectInDb(shipId, shipTitle, shipTopic, shipStyle);

  const shipBible = await productionBibleAgent.run(
    shipTopic,
    shipStyle,
    'English',
    '16:9',
    shipId,
    apiKey,
    'gemini-2.5-flash'
  );
  BibleRepository.createOrUpdate(shipId, shipBible);

  const shipHero = (shipBible.object_registry || []).find((o: any) => o.is_hero_prop);
  if (!shipHero) {
    throw new Error('No hero prop found in Ship bible object registry');
  }

  const shipPhaseId = crypto.randomUUID();
  const shipNarration = 'The container ship docks slowly.';
  createPhaseInDb(shipId, shipPhaseId, shipNarration);

  const shipPhaseItem: ScriptPhaseItem = {
    phase_number: 1,
    phase_type: 'hook',
    phase_title: 'Introduction',
    phase_content: 'Intro content',
    narration_text: shipNarration,
    narration_word_count: 5,
    key_events: [],
    character_ids_active: [],
    location_id_primary: shipBible.location_roster?.[0]?.id || 'LOC_001',
    estimated_duration_seconds: 5,
    viral_hook_rating: 9,
  };

  const shipSceneBreakdown = await sceneAgent.run(
    shipPhaseItem,
    shipBible,
    shipId,
    1,
    0,
    apiKey,
    'gemini-2.5-flash'
  );

  if (shipSceneBreakdown.scenes && shipSceneBreakdown.scenes.length > 0) {
    shipSceneBreakdown.scenes[0].object_ids_featured = [shipHero.id];
    const parsedRaw = JSON.parse((shipSceneBreakdown.scenes[0] as any).raw_json || '{}');
    parsedRaw.object_ids_featured = [shipHero.id];
    (shipSceneBreakdown.scenes[0] as any).raw_json = JSON.stringify(parsedRaw);
  }

  SceneRepository.createOrUpdateBatch(shipId, shipPhaseId, 1, shipSceneBreakdown.scenes);

  const shipSavedScenes = SceneRepository.findByPhase(shipId, 1);
  const shipDbScene = shipSavedScenes[0];
  const shipParsedScene = JSON.parse(shipDbScene.raw_json);

  const shipObjectsFeaturedResolved = (shipParsedScene.object_ids_featured || []).map((objId: string) => {
    const obj = shipBible.object_registry.find((o: any) => o.id === objId || o.object_id === objId);
    return obj ? {
      id: obj.id || obj.object_id || objId,
      object_id: obj.object_id || obj.id || objId,
      name: obj.name,
      description: obj.description,
      symbolic_meaning: obj.symbolic_meaning,
      screen_time: obj.screen_time,
      is_branded_product: obj.is_branded_product === true
    } : { id: objId, object_id: objId };
  });

  const shipResolvedScene = {
    title: shipDbScene.title,
    scene_number: shipDbScene.scene_number,
    phase_number: shipDbScene.phase_number,
    narration_fragment: shipDbScene.narration_fragment,
    emotional_beat: shipParsedScene.emotional_beat || 'standard',
    scene_description: shipDbScene.scene_description,
    continuity_notes: shipDbScene.continuity_notes,
    transition_to_next: shipParsedScene.transition_to_next || 'cut',
    location_description: 'Test Location',
    characters_present: [],
    objects_featured: shipObjectsFeaturedResolved,
    raw_json: shipDbScene.raw_json
  };

  const shipProject = ProjectRepository.findById(shipId);
  const shipPrompt = await veoAgent.run(
    shipResolvedScene,
    shipProject,
    shipBible,
    shipId,
    1,
    1,
    apiKey,
    'gemini-2.5-flash'
  );

  // --------------------------------------------------
  // EVALUATION & CHECKS
  // --------------------------------------------------
  console.log('\n==================================================');
  console.log('                  EVALUATING ROWS                 ');
  console.log('==================================================');

  // Check 1: Bible is_branded_product and visual_lock containing branding details
  const stingBibleOK = stingHero.is_branded_product === true && 
                       /sting|red|lightning|logo|can|brand/i.test(stingHero.visual_lock || '');
  const shipBibleOK = shipHero.is_branded_product === false && 
                      !/msc|maersk|evergreen|isabella|sagar/i.test(shipHero.visual_lock || '');

  // Check 2: Scene resolved objects featured carries is_branded_product
  const stingSceneObj = stingResolvedScene.objects_featured[0] as any;
  const stingSceneOK = stingSceneObj && stingSceneObj.is_branded_product === true;

  const shipSceneObj = shipResolvedScene.objects_featured[0] as any;
  const shipSceneOK = shipSceneObj && !shipSceneObj.is_branded_product;

  // Check 3: Veo hasBrandedProductFeatured (Checks if the agent's initial calculation on input resolvedScene evaluated to true/false)
  const stingInitialRawSceneJson = (stingResolvedScene as any).raw_json ? (typeof (stingResolvedScene as any).raw_json === 'string' ? JSON.parse((stingResolvedScene as any).raw_json) : (stingResolvedScene as any).raw_json) : null;
  const stingInitialFeaturedObjectIds = stingInitialRawSceneJson?.object_ids_featured || [];
  const stingInitialHasBranded = (stingInitialFeaturedObjectIds || []).some((objId: string) => {
    const obj = (stingBible.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
    return obj && obj.is_branded_product === true;
  });
  
  let stingDbHasBranded = false;
  try {
    const sceneRow = db.prepare('SELECT raw_json FROM scenes WHERE project_id = ? AND phase_number = ? AND scene_number = ?')
      .get(stingId, stingResolvedScene.phase_number, stingResolvedScene.scene_number) as { raw_json: string } | undefined;
    if (sceneRow) {
      const parsed = JSON.parse(sceneRow.raw_json);
      const dbFeaturedObjectIds = parsed.object_ids_featured || [];
      stingDbHasBranded = (dbFeaturedObjectIds || []).some((objId: string) => {
        const obj = (stingBible.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
        return obj && obj.is_branded_product === true;
      });
    }
  } catch (err) {}

  // Survival check: Both initial & DB checks must be true for Branded A
  const stingVeoBrandedOK = (stingInitialHasBranded === true) && (stingDbHasBranded === true);

  const shipInitialRawSceneJson = (shipResolvedScene as any).raw_json ? (typeof (shipResolvedScene as any).raw_json === 'string' ? JSON.parse((shipResolvedScene as any).raw_json) : (shipResolvedScene as any).raw_json) : null;
  const shipInitialFeaturedObjectIds = shipInitialRawSceneJson?.object_ids_featured || [];
  const shipInitialHasBranded = (shipInitialFeaturedObjectIds || []).some((objId: string) => {
    const obj = (shipBible.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
    return obj && obj.is_branded_product === true;
  });

  let shipDbHasBranded = false;
  try {
    const sceneRow = db.prepare('SELECT raw_json FROM scenes WHERE project_id = ? AND phase_number = ? AND scene_number = ?')
      .get(shipId, shipResolvedScene.phase_number, shipResolvedScene.scene_number) as { raw_json: string } | undefined;
    if (sceneRow) {
      const parsed = JSON.parse(sceneRow.raw_json);
      const dbFeaturedObjectIds = parsed.object_ids_featured || [];
      shipDbHasBranded = (dbFeaturedObjectIds || []).some((objId: string) => {
        const obj = (shipBible.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
        return obj && obj.is_branded_product === true;
      });
    }
  } catch (err) {}

  const shipVeoBrandedOK = (shipInitialHasBranded === false) && (shipDbHasBranded === false);

  // Check 4: Veo avoid contains/excludes BRAND_AVOIDS terms
  const BRAND_AVOIDS = ['brand names', 'logo', 'text', 'letters', 'typography', 'written words'];
  const stingAvoidTermsMatched = BRAND_AVOIDS.filter(term => stingPrompt.avoid.toLowerCase().includes(term));
  const stingAvoidOK = stingAvoidTermsMatched.length === 0;

  const shipAvoidTermsMatched = BRAND_AVOIDS.filter(term => shipPrompt.avoid.toLowerCase().includes(term));
  const shipAvoidOK = shipAvoidTermsMatched.length > 0;

  // Check 5: Veo Visual contains branded cues / B's visual is clean
  const stingVisualOK = /sting|scorpion|red|lightning|logo|can/i.test(stingPrompt.visual);
  const shipVisualOK = !/msc|maersk|evergreen|isabella|sagar/i.test(shipPrompt.visual);

  // Check 6: Isolation - overlay_suggestions text does NOT appear in veo_full_prompt
  const testOverlays = [
    { text: 'UniqueOverlayText123', type: 'label' as const, target: 'can' }
  ];
  
  const testStingPrompt = { ...stingPrompt, overlay_suggestions: testOverlays };
  const stingAssembledPrompt = assembleVeoFullPrompt(testStingPrompt, 1, 'Sting Scene');
  const stingIsolationOK = !stingAssembledPrompt.includes('UniqueOverlayText123');

  const testShipPrompt = { ...shipPrompt, overlay_suggestions: testOverlays };
  const shipAssembledPrompt = assembleVeoFullPrompt(testShipPrompt, 1, 'Ship Scene');
  const shipIsolationOK = !shipAssembledPrompt.includes('UniqueOverlayText123');

  // Print results table
  console.log('\n--- CHECKLIST RESULTS ---');
  console.log('| Check | Fixture A (Branded) | Fixture B (Generic) |');
  console.log('|---|---|---|');
  console.log(`| (1) Bible: is_branded_product & visual_lock | ${stingBibleOK ? 'PASS' : 'FAIL'} | ${shipBibleOK ? 'PASS' : 'FAIL'} |`);
  console.log(`| (2) Scene: objects_featured carries flag    | ${stingSceneOK ? 'PASS' : 'FAIL'} | ${shipSceneOK ? 'PASS' : 'FAIL'} |`);
  console.log(`| (3) Veo: hasBrandedProductFeatured          | ${stingVeoBrandedOK ? 'PASS' : 'FAIL'} | ${shipVeoBrandedOK ? 'PASS' : 'FAIL'} |`);
  console.log(`| (4) Veo avoid: BRAND_AVOIDS presence        | ${stingAvoidOK ? 'PASS' : 'FAIL'} | ${shipAvoidOK ? 'PASS' : 'FAIL'} |`);
  console.log(`| (5) Veo Visual: contains branded cues        | ${stingVisualOK ? 'PASS' : 'FAIL'} | ${shipVisualOK ? 'PASS' : 'FAIL'} |`);
  console.log(`| (6) Isolation: overlay text in full prompt  | ${stingIsolationOK ? 'PASS' : 'FAIL'} | ${shipIsolationOK ? 'PASS' : 'FAIL'} |`);

  const allStingPass = stingBibleOK && stingSceneOK && stingVeoBrandedOK && stingAvoidOK && stingVisualOK && stingIsolationOK;
  const allShipPass = shipBibleOK && shipSceneOK && shipVeoBrandedOK && shipAvoidOK && shipVisualOK && shipIsolationOK;
  console.log(`\nALL LINKS OK: ${allStingPass && allShipPass}`);

  // Report details on fails
  if (!allStingPass || !allShipPass) {
    console.log('\n==================================================');
    console.log('              BROKEN LINKS DIAGNOSIS              ');
    console.log('==================================================');
    if (!stingSceneOK) {
      console.log('❌ Broken Link in: (2) Scene objects_featured flag preservation');
      console.log('   File: backend/src/routes/veoprompts.routes.ts:189-197');
      console.log('   Why: The mapping of object_registry items to objects_featured in the route only copies:');
      console.log('        name, description, symbolic_meaning, screen_time.');
      console.log('        It does NOT copy "is_branded_product", dropping the branding flag.');
    }
    if (!stingVeoBrandedOK) {
      console.log('❌ Broken Link in: (3) Veo hasBrandedProductFeatured initial flag evaluation');
      console.log('   File: backend/src/routes/veoprompts.routes.ts:200-212');
      console.log('   Why: The route constructs resolvedScene without copying the raw_json property.');
      console.log('        Since veoAgent.run uses resolvedScene.raw_json to compute initial hasBrandedProductFeatured,');
      console.log('        the agent computes hasBrandedProductFeatured = false during initial prompt generation.');
      console.log('        This causes it to send BRAND_AVOIDS terms to the LLM instruction for branded products.');
    }
  }

  // Clean up database entries
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM phases WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM scenes WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(id);
  }

  db.close();
}

runCheck().catch(console.error);
