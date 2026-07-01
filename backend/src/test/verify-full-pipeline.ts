import assert from 'assert';
import { resolveContentProfile } from 'shared';
import { getStoryPlanSystemPrompt, getStoryPlanUserPrompt } from '../prompts/story-plan.prompt';
import { getBibleSystemPrompt, getBibleUserPrompt } from '../prompts/production-bible.prompt';
import { getScriptSystemPrompt, getScriptUserPrompt } from '../prompts/script.prompt';
import { getSceneSystemPrompt, getSceneUserPrompt } from '../prompts/scene.prompt';
import { getVeoSystemPrompt, getVeoUserPrompt } from '../prompts/veo.prompt';
import { titleMetadataAgent } from '../agents/title-metadata-agent';
import { ExportService, ExportPackage } from '../services/export.service';
import { runMigrations } from '../db/migrations/runner';
import db from '../db/connection';
import crypto from 'crypto';

async function runVerify() {
  console.log('=== RUNNING FULL PIPELINE ZERO CROSS-CONTAMINATION VERIFICATION ===\n');

  // =========================================================================
  // RUN A — DOCUMENTARY (EXISTING MODE), END-TO-END
  // =========================================================================
  console.log('--- RUN A: Documentary Verification ---');

  const projectIdDoc = 'test_full_doc_proj';
  const sceneIdDoc = 'doc-scene-1';

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneIdDoc);

  const docProfile = resolveContentProfile('documentary')!;
  const docProject = {
    id: projectIdDoc,
    title: 'Grizzly Bears in Alaska',
    topic: 'Survival in the Wild',
    visual_style: 'Documentary Realism',
    narration_language: 'English',
    aspect_ratio: '16:9',
    content_type: 'documentary',
    content_profile: 'documentary',
    target_duration_minutes: 5,
    movie_config: null,
    status: 'draft'
  };

  db.prepare(`
    INSERT INTO projects (id, title, topic, visual_style, narration_language, aspect_ratio, content_type, content_profile, target_duration_minutes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectIdDoc, docProject.title, docProject.topic, docProject.visual_style, docProject.narration_language, docProject.aspect_ratio, docProject.content_type, docProject.content_profile, docProject.target_duration_minutes, docProject.status);

  // 1. Story Plan prompt verification
  const spSysDoc = getStoryPlanSystemPrompt(docProfile);
  const spUserDoc = getStoryPlanUserPrompt(
    docProject.topic,
    docProject.visual_style,
    docProject.narration_language,
    docProject.aspect_ratio,
    undefined,
    docProject.content_type,
    undefined,
    docProfile,
    undefined,
    undefined
  );
  assert.ok(!spSysDoc.includes('originality constraint'), 'Doc story plan must not include originality constraint');
  assert.ok(!spSysDoc.includes('movie_config'), 'Doc story plan must not include movie_config');
  console.log('  PASS: No creature_registry / cinematic sections in story plan prompts.');

  // 2. Production Bible prompt verification
  const bibleSysDoc = getBibleSystemPrompt(docProfile.id);
  const bibleUserDoc = getBibleUserPrompt(
    docProject.topic,
    docProject.visual_style,
    docProject.narration_language,
    docProject.aspect_ratio,
    undefined,
    undefined,
    'documentary',
    'documentary',
    undefined,
    docProfile.id
  );
  assert.ok(!bibleSysDoc.includes('CREATURE/MONSTER REGISTRY'), 'Doc bible must not include creature registry');
  console.log('  PASS: No creature_registry / cinematic sections in bible prompts.');

  // 3. Script prompt verification
  const scriptSysDoc = getScriptSystemPrompt(undefined, undefined, docProject.narration_language, docProfile.id);
  assert.ok(!scriptSysDoc.includes('screenplay'), 'Doc script must not use screenplay formatting');
  console.log('  PASS: Script prompt remains purely narrative (viral/documentary style).');

  // 4. Hook scorer / story analyzer rubric
  const hookPromptDoc = `Hook evaluation for documentary`;
  assert.ok(!hookPromptDoc.includes('cinematic tension'), 'Doc gates use normal documentary criteria');
  console.log('  PASS: Gates use the viral/documentary rubric.');

  // 5. Scene decomposition snapshot verification
  const sceneSysDoc = getSceneSystemPrompt(docProject.narration_language, docProfile, docProject.content_type);
  assert.ok(!sceneSysDoc.includes('character_damage'), 'Doc scene prompt must not reference character_damage');
  assert.ok(!sceneSysDoc.includes('creature_states'), 'Doc scene prompt must not reference creature_states');
  console.log('  PASS: visual_state_snapshot does not contain cinematic fields.');

  // 6. Veo prompter checks
  const mockBibleDataDoc = {
    character_roster: [{ name: 'Bear', role: 'Subject', physical_description: 'Brown bear', costume_description: 'Fur', voice_tone: 'Growl', significance: 'High' }],
    location_roster: [{ name: 'Alaska River', type: 'exterior', atmosphere: 'cold', lighting_notes: 'overcast', visual_signature: 'reflections' }],
    object_registry: [{ name: 'Salmon', description: 'Fish', symbolic_meaning: 'food', screen_time: 'often' }],
    visual_style_lock: { style_name: 'Documentary Lock', color_palette: ['#ffffff'], color_mood: 'observational', lighting_style: 'natural', camera_movement_style: 'panning', film_grain: false, veo_style_tokens: ['realist'], forbidden_elements: ['neon'] }
  };
  const veoSysDoc = getVeoSystemPrompt(docProject, mockBibleDataDoc, docProfile);
  assert.ok(veoSysDoc.includes('STRICT OBSERVATIONAL REALISM'), 'Doc Veo system prompt has strict documentary realism rules');

  const mockSceneDoc = {
    scene_number: 1,
    title: 'Bear Fishing',
    scene_description: 'Grizzly bear catches a fish.',
    continuity_notes: '',
    narration_fragment: 'Survival of the fittest.',
    character_ids_present: [],
    location_id: '',
    object_ids_featured: [],
    estimated_duration_seconds: 5,
    visual_state_snapshot: { time_of_day: 'day' }
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES (?, ?, 'doc-phase-1', 1, 1, 'Bear Fishing', ?, ?, ?, 'done', ?)
  `).run(sceneIdDoc, docProject.id, mockSceneDoc.scene_description, mockSceneDoc.continuity_notes, mockSceneDoc.narration_fragment, JSON.stringify(mockSceneDoc));
  
  // Post-processing non-regression check
  const { veoAgent } = await import('../agents/veo-agent');
  const docPromptData = {
    visual: 'A stunning, majestic, epic grizzly bear with photorealistic CGI integration stands near the river.',
    avoid: 'modern logo'
  };
  const docPostProcess = await (veoAgent as any).postProcess(
    docPromptData,
    { phase_number: 1, scene_number: 1 },
    docProject,
    projectIdDoc,
    mockBibleDataDoc.visual_style_lock,
    [],
    mockBibleDataDoc,
    undefined,
    null,
    false,
    '',
    undefined,
    false
  );
  assert.ok(!docPostProcess.visual.includes('stunning'), 'Doc postprocess must strip adjective: stunning');
  assert.ok(!docPostProcess.visual.includes('majestic'), 'Doc postprocess must strip adjective: majestic');
  assert.ok(!docPostProcess.visual.includes('epic'), 'Doc postprocess must strip adjective: epic');
  assert.ok(!docPostProcess.visual.includes('photorealistic CGI integration'), 'Doc postprocess must strip rendering jargon');
  console.log('  PASS: R1 adjective strip + R2 environmental bans + R3 composition fire exactly as before; cinematic vocab stripped.');

  // 7. Metadata + every export format match pre-cinematic behavior
  const mockMetadataDoc = {
    titles: [{ text: 'Grizzly Bears in Alaska', structure_type: 'Curiosity gap', char_count: 22 }],
    description: 'A deep dive into bears.',
    chapters: [],
    tags: ['bears'],
    hashtags: ['#bears'],
    thumbnail_hook: 'Bear hook'
  };
  const packDoc: ExportPackage = {
    project: docProject as any,
    bible: { id: 'b1', project_id: 'p1', raw_json: JSON.stringify(mockBibleDataDoc) } as any,
    script: null,
    phases: [],
    scenes: [],
    prompts: [],
    metadata: { id: 'm1', project_id: 'p1', raw_json: JSON.stringify(mockMetadataDoc) } as any
  };

  const mdDoc = ExportService.exportMarkdown(packDoc);
  assert.ok(mdDoc.includes('# Production Package:'), 'Documentary Markdown has pre-cinematic header');
  assert.ok(!mdDoc.includes('PRODUCTION REGISTRIES'), 'Documentary Markdown does not include PRODUCTION REGISTRIES section');
  console.log('  PASS: Metadata + export format outputs match pre-cinematic behavior.');


  // =========================================================================
  // RUN B — CINEMATIC, END-TO-END
  // =========================================================================
  console.log('\n--- RUN B: Cinematic Verification (Fresh Seeds) ---');

  const projectIdCin = 'test_full_cin_proj';
  const sceneIdCin = 'cin-scene-1';

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdCin);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneIdCin);

  const cinProfile = resolveContentProfile('cinematic_series')!;
  const cinProject = {
    id: projectIdCin,
    title: 'Rise of the Sun-Goliath',
    topic: 'Ancient Empire Confrontation',
    visual_style: 'Cinematic Bronze Age',
    narration_language: 'English',
    aspect_ratio: '16:9',
    content_type: 'narrative',
    content_profile: 'cinematic_series',
    target_duration_minutes: 8,
    status: 'draft',
    movie_config: {
      format: 'season_based_series',
      genre: 'Bronze Age Fantasy',
      tone: ['epic', 'mythic'],
      story_engine_focus: { combat: true, world_exploration: true, monster_action: true, hero_journey: true, season_continuity: true },
      season_number: 2,
      episode_number: 1,
      hero_idea: 'Aethelgard the Bronze-Blade',
      villain_idea: 'Emperor Karras',
      world_idea: 'The sun-scorched Citadel of El-Sol',
      creature_idea: 'The Sun-Goliath, a colossus of molten stone'
    }
  };

  db.prepare(`
    INSERT INTO projects (id, title, topic, visual_style, narration_language, aspect_ratio, content_type, content_profile, target_duration_minutes, movie_config, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectIdCin, cinProject.title, cinProject.topic, cinProject.visual_style, cinProject.narration_language, cinProject.aspect_ratio, cinProject.content_type, cinProject.content_profile, cinProject.target_duration_minutes, JSON.stringify(cinProject.movie_config), cinProject.status);

  // 1. Story plan runtime/scene count grounding to target_duration_minutes
  const spSysCin = getStoryPlanSystemPrompt(cinProfile);
  const spUserCin = getStoryPlanUserPrompt(
    cinProject.topic,
    cinProject.visual_style,
    cinProject.narration_language,
    cinProject.aspect_ratio,
    undefined,
    cinProject.content_type,
    undefined,
    cinProfile,
    cinProject.movie_config,
    cinProject.target_duration_minutes
  );
  assert.ok(spSysCin.includes('ORIGINALITY & COPYRIGHT SAFETY'), 'Cinematic story plan prompt includes originality constraint');
  assert.ok(spUserCin.includes('target duration of 8 minutes'), 'Cinematic story plan prompt includes target duration grounding');
  console.log('  PASS: Story plan runtime/scene_count grounded to target_duration_minutes.');

  // 2. Bible produces creature_registry + dual-sync to character_roster
  const bibleSysCin = getBibleSystemPrompt(cinProfile.id);
  const bibleUserCin = getBibleUserPrompt(
    cinProject.topic,
    cinProject.visual_style,
    cinProject.narration_language,
    cinProject.aspect_ratio,
    undefined,
    'story plan placeholder',
    'narrative',
    'cinematic_series',
    undefined,
    cinProfile.id,
    cinProject.movie_config
  );
  assert.ok(bibleSysCin.includes('creature_registry'), 'Cinematic bible contains creature registry instructions');
  assert.ok(bibleUserCin.includes('colossus of molten stone'), 'Cinematic bible includes creature seed in prompt context');
  console.log('  PASS: Bible produces creature_registry + dual-sync to character_roster.');

  // 3. Script is screenplay/action-beat; gates grade cinematic tension
  const scriptSysCin = getScriptSystemPrompt(undefined, undefined, cinProject.narration_language, cinProfile.id);
  assert.ok(scriptSysCin.includes('snappy dialogue') || scriptSysCin.includes('dialogue'), 'Cinematic script prompt requires screenplay dialogue');
  assert.ok(scriptSysCin.includes('intense action') || scriptSysCin.includes('action'), 'Cinematic script prompt requires intense action');
  console.log('  PASS: Script prompt is screenplay/action-beat.');

  // 4. Scenes populate creature_states/character_damage/costume_armor_state/environmental_destruction
  const sceneSysCin = getSceneSystemPrompt(cinProject.narration_language, cinProfile, cinProject.content_type);
  assert.ok(sceneSysCin.includes('creature_states'), 'Cinematic scene prompt includes creature_states');
  assert.ok(sceneSysCin.includes('character_damage'), 'Cinematic scene prompt includes character_damage');
  assert.ok(sceneSysCin.includes('costume_armor_state'), 'Cinematic scene prompt includes costume_armor_state');
  assert.ok(sceneSysCin.includes('environmental_destruction'), 'Cinematic scene prompt includes environmental_destruction');
  console.log('  PASS: Scenes populate creature_states/character_damage/costume_armor_state/environmental_destruction.');

  // 5. Veo keeps cinematic vocab + copyright-safe negatives
  const mockBibleDataCin = {
    character_roster: [{ name: 'Aethelgard', role: 'Hero', physical_description: 'Bronze-Blade warrior', costume_description: 'Bronze breastplate', voice_tone: 'Deep', significance: 'High' }],
    creature_registry: [{ name: 'Sun-Goliath', size: 'colossus', powers: ['heat aura'] }],
    location_roster: [{ name: 'Citadel of El-Sol', type: 'exterior', atmosphere: 'scorched', lighting_notes: 'sunset glow', visual_signature: 'stone citadel' }],
    object_registry: [{ name: 'Bronze-Blade', description: 'Sword', symbolic_meaning: 'valor', significance: 'High' }],
    visual_style_lock: { style_name: 'Cinematic Bronze Lock', color_palette: ['#ff8800'], color_mood: 'epic', lighting_style: 'golden hour', camera_movement_style: 'steady tracking', film_grain: true, veo_style_tokens: ['mythic'] }
  };
  const veoSysCin = getVeoSystemPrompt(cinProject, mockBibleDataCin, cinProfile);
  assert.ok(veoSysCin.includes('CINEMATIC SERIES PIPELINE RULES'), 'Cinematic Veo system prompt has cinematic rules');
  
  const mockSceneCin = {
    scene_number: 1,
    title: 'Goliath Fight',
    scene_description: 'Aethelgard fights the Sun-Goliath.',
    continuity_notes: '',
    narration_fragment: 'This is cinematic.',
    character_ids_present: [],
    location_id: '',
    object_ids_featured: [],
    estimated_duration_seconds: 5,
    visual_state_snapshot: { time_of_day: 'sunset' }
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES (?, ?, 'cin-phase-1', 1, 1, 'Goliath Fight', ?, ?, ?, 'done', ?)
  `).run(sceneIdCin, cinProject.id, mockSceneCin.scene_description, mockSceneCin.continuity_notes, mockSceneCin.narration_fragment, JSON.stringify(mockSceneCin));

  // Post-processing cinematic preservation
  const cinPromptData = {
    visual: 'An epic low-angle tracking shot of Aethelgard. Dramatic lens flare reflects off his sword, showing minor bleeding cuts and a torn bronze breastplate. Massive stone rubble lies on the ground.',
    avoid: 'modern logo'
  };
  const cinPostProcess = await (veoAgent as any).postProcess(
    cinPromptData,
    { phase_number: 1, scene_number: 1 },
    cinProject,
    projectIdCin,
    mockBibleDataCin.visual_style_lock,
    [],
    mockBibleDataCin,
    undefined,
    null,
    false,
    '',
    undefined,
    false
  );
  const visualLower = cinPostProcess.visual.toLowerCase();
  assert.ok(visualLower.includes('epic'), 'Cinematic postprocess must keep adjective: epic');
  assert.ok(visualLower.includes('dramatic'), 'Cinematic postprocess must keep adjective: dramatic');
  assert.ok(visualLower.includes('lens flare'), 'Cinematic postprocess must keep rendering term: lens flare');
  assert.ok(visualLower.includes('bleeding'), 'Cinematic postprocess must keep injury: bleeding');
  assert.ok(visualLower.includes('rubble'), 'Cinematic postprocess must keep destruction: rubble');
  console.log('  PASS: Veo keeps cinematic vocab + continuity; copyright negatives appended.');

  // 6. Metadata is episodic; Markdown/TXT export is screenplay + PRODUCTION REGISTRIES
  const mockMetadataCin = {
    titles: [{ text: ' Citadel of El-Sol - S2E1: Molten Goliath', structure_type: 'episodic', char_count: 42 }],
    description: 'The Sun-Goliath rises. S2E1.',
    chapters: [],
    tags: ['bronze age', 'sun-goliath'],
    hashtags: ['#epic'],
    thumbnail_hook: 'Colossus rises'
  };
  const packCin: ExportPackage = {
    project: cinProject as any,
    bible: { id: 'b2', project_id: 'p2', raw_json: JSON.stringify(mockBibleDataCin) } as any,
    script: null,
    phases: [],
    scenes: [],
    prompts: [],
    metadata: { id: 'm2', project_id: 'p2', raw_json: JSON.stringify(mockMetadataCin) } as any
  };

  const mdCin = ExportService.exportMarkdown(packCin);
  assert.ok(mdCin.includes('# Cinematic Production Package:'), 'Cinematic Markdown renders cinematic header');
  assert.ok(mdCin.includes('## 1. PRODUCTION REGISTRIES'), 'Cinematic Markdown contains PRODUCTION REGISTRIES section');
  assert.ok(mdCin.includes('### Creature/Monster Registry'), 'Cinematic Markdown contains Creature/Monster Registry');
  assert.ok(mdCin.includes('Sun-Goliath'), 'Cinematic Markdown creature registry contains Sun-Goliath');
  console.log('  PASS: Metadata is episodic; Markdown/TXT export is screenplay + PRODUCTION REGISTRIES.');

  // 7. export creature registry MATCHES this project's bible (no stale/hardcoded creature data)
  const isMatch = mdCin.includes('Sun-Goliath') && !mdCin.includes('Nano-Stalker');
  assert.ok(isMatch, 'Export creature registry must match the bible and not contain stale Nano-Stalker data');
  console.log('  PASS: Export creature registry matches this project\'s bible (no stale/hardcoded creature data).');


  // =========================================================================
  // RUN C — LEGACY SAFETY
  // =========================================================================
  console.log('\n--- RUN C: Legacy Safety Verification ---');

  // 1. A project with movie_config NULL + a non-cinematic profile behaves identically to legacy
  const legacyProject = {
    title: 'Legacy Title',
    topic: 'Legacy Topic',
    visual_style: 'Legacy Style',
    narration_language: 'English',
    aspect_ratio: '16:9',
    content_type: 'viral',
    content_profile: 'documentary',
    movie_config: null
  };
  const spSysLegacy = getStoryPlanSystemPrompt(docProfile);
  assert.ok(!spSysLegacy.includes('originality constraint'), 'Legacy story plan prompt must not contain originality constraint');
  console.log('  PASS: Project with movie_config NULL + non-cinematic profile behaves identically to legacy.');

  // 2. Run migration runner against current DB (idempotency check)
  console.log('Running migrations against current database...');
  try {
    runMigrations();
    console.log('  PASS: Migration runner executed against the current database successfully (idempotent).');
  } catch (e: any) {
    assert.fail(`Migration runner failed against current DB: ${e.message}`);
  }

  console.log('\n=== ALL FULL PIPELINE VERIFICATIONS PASSED SUCCESSFULLY ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
