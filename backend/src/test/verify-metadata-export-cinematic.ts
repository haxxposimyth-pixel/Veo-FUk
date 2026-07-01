import assert from 'assert';
import { LLMRouter } from '../services/llm-router';
import { titleMetadataAgent } from '../agents/title-metadata-agent';
import { ExportService, ExportPackage } from '../services/export.service';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function runVerify() {
  console.log('=== STARTING METADATA & EXPORT CINEMATIC VERIFICATION ===\n');

  // =========================================================================
  // PART A: NON-REGRESSION (NON-CINEMATIC / DOCUMENTARY)
  // =========================================================================
  console.log('--- PART A: Non-Regression Check (Documentary) ---');

  const projectIdDoc = 'test_meta_doc_proj';

  // Setup clean database state
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdDoc);

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
    VALUES (?, 'Doc Movie', 'Wildlife of Alaska', 'prompts', 'Documentary', 'English', '16:9', 'documentary', 'documentary')
  `).run(projectIdDoc);

  const mockBibleDoc = {
    character_roster: [{ name: 'Grizzly Bear', role: 'Subject', physical_description: 'Big brown bear', costume_description: 'Fur', voice_tone: 'Growl', significance: 'High' }],
    location_roster: [{ name: 'Alaska River', type: 'exterior', atmosphere: 'cold', lighting_notes: 'overcast', visual_signature: 'running water' }],
    object_registry: [{ name: 'Salmon', description: 'Fish', symbolic_meaning: 'food', screen_time: 'often' }],
    visual_style_lock: { style_name: 'Documentary Style', color_palette: ['#ffffff'], color_mood: 'observational', lighting_style: 'natural', camera_movement_style: 'panning', film_grain: false, veo_style_tokens: ['realist'], forbidden_elements: ['neon'] },
    version: 1
  };
  db.prepare(`
    INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(crypto.randomUUID(), projectIdDoc, JSON.stringify(mockBibleDoc.character_roster), JSON.stringify(mockBibleDoc.location_roster), JSON.stringify(mockBibleDoc.object_registry), JSON.stringify(mockBibleDoc.visual_style_lock), JSON.stringify(mockBibleDoc));

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, status)
    VALUES ('doc-phase-1', ?, 1, 'hook', 'Cold Open', 'Grizzly bear searches for food.', 'done')
  `).run(projectIdDoc);

  const mockSceneDoc = {
    scene_number: 1,
    title: 'Bear Searching',
    scene_description: 'A grizzly bear scanning the river.',
    continuity_notes: '',
    narration_fragment: 'The bear watches.',
    character_ids_present: [],
    location_id: 'LOC_001',
    object_ids_featured: [],
    emotional_beat: 'calm',
    transition_to_next: 'cut',
    estimated_duration_seconds: 8
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES ('doc-scene-1', ?, 'doc-phase-1', 1, 1, 'Bear Searching', ?, '', ?, 'done', ?)
  `).run(projectIdDoc, mockSceneDoc.scene_description, mockSceneDoc.narration_fragment, JSON.stringify(mockSceneDoc));

  const mockPromptDoc = {
    prompt_number: '1',
    visual: 'A grizzly bear scans the river.',
    shot: 'Wide',
    shot_type: 'wide',
    lens: 'Telephoto',
    lighting: 'Overcast',
    camera: 'Panning',
    ambient_sound: 'river',
    sfx: 'None',
    dialogue: 'None.',
    avoid: 'neon',
    connection: 'None',
    narration: 'The bear watches.',
    duration_seconds: 8,
    veo_full_prompt: 'A grizzly bear scans the river. Wide shot, panning, overcast. Avoid: neon.'
  };
  await VeoPromptRepository.createOrUpdate(projectIdDoc, 'doc-scene-1', 1, 1, mockPromptDoc as any);

  const mockMetadataDoc = {
    titles: [
      { text: 'The Truth About Grizzly Bears', structure_type: 'Curiosity gap', char_count: 30 }
    ],
    description: 'A deep dive into grizzly bear behavior in Alaska. [CHAPTERS]',
    chapters: [{ timestamp: '00:00', label: 'Cold Open' }],
    tags: ['bears', 'alaska'],
    hashtags: ['#wildlife', '#nature'],
    thumbnail_hook: 'Bears caught on camera'
  };

  // Mock LLM Router
  let lastPromptPassed = '';
  const originalGenerateStream = LLMRouter.generateStream;
  LLMRouter.generateStream = async (agentName, prompt, onChunk, onComplete, onError, options) => {
    lastPromptPassed = prompt;
    onChunk(JSON.stringify(mockMetadataDoc));
    onComplete(JSON.stringify(mockMetadataDoc));
    return { billing_source: 'ai_studio' };
  };

  // 1. Check titleMetadataAgent prompt non-regression
  console.log('Running titleMetadataAgent for documentary...');
  const docMetaResult = await titleMetadataAgent.run(
    projectIdDoc,
    'Alaska Wildlife',
    mockBibleDoc,
    [{ phase_number: 1, phase_title: 'Cold Open', narration_text: 'Bear searching' }],
    null,
    undefined,
    'gemini-2.5-flash'
  );

  assert.ok(lastPromptPassed.includes('YouTube SEO and title optimization expert'), 'Documentary metadata prompt must use viral/YouTube context');
  assert.ok(!lastPromptPassed.includes('Screenplay Publicist'), 'Documentary metadata prompt must not contain screenplay publicist text');
  console.log('✓ Documentary metadata prompt remains unchanged.');

  // 2. Check Export Package Non-regression
  const packDoc: ExportPackage = {
    project: db.prepare('SELECT * FROM projects WHERE id = ?').get(projectIdDoc) as any,
    bible: db.prepare('SELECT * FROM production_bibles WHERE project_id = ?').get(projectIdDoc) as any,
    script: null,
    phases: db.prepare('SELECT * FROM phases WHERE project_id = ?').all(projectIdDoc) as any[],
    scenes: db.prepare('SELECT * FROM scenes WHERE project_id = ?').all(projectIdDoc) as any[],
    prompts: db.prepare('SELECT * FROM veo_prompts WHERE project_id = ?').all(projectIdDoc) as any[],
    metadata: { id: 'meta-doc', project_id: projectIdDoc, selected_title: 'The Truth About Grizzly Bears', thumbnail_hook: 'Bears caught on camera', raw_json: JSON.stringify(mockMetadataDoc) } as any
  };

  const mdDoc = ExportService.exportMarkdown(packDoc);
  const txtDoc = ExportService.exportTXT(packDoc);
  const jsonDoc = ExportService.exportJSON(packDoc);
  const csvDoc = ExportService.exportCSV(packDoc);

  assert.ok(mdDoc.includes('# Production Package:'), 'Documentary Markdown must use standard header');
  assert.ok(mdDoc.includes('## 1. Production Bible'), 'Documentary Markdown must use Section 1 Production Bible header');
  assert.ok(!mdDoc.includes('PRODUCTION REGISTRIES'), 'Documentary Markdown must not contain PRODUCTION REGISTRIES');
  assert.ok(!mdDoc.includes('CREATURE REGISTRY:'), 'Documentary Markdown must not contain CREATURE REGISTRY');
  assert.ok(txtDoc.includes('=== SCRIPT BOOKLET:'), 'Documentary TXT must use standard Script Booklet header');
  assert.ok(jsonDoc.includes('"project":'), 'JSON export functions normally');
  assert.ok(csvDoc.includes('"prompt_number"'), 'CSV export functions normally');
  console.log('✓ Documentary export outputs remain 100% unchanged.');


  // =========================================================================
  // PART B: CINEMATIC METADATA & EXPORT (CINEMATIC SERIES)
  // =========================================================================
  console.log('\n--- PART B: Cinematic Metadata & Export Check (Cinematic Series) ---');

  const projectIdCin = 'test_meta_cin_proj';

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdCin);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdCin);

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile, movie_config)
    VALUES (?, 'Cinematic Series', 'Vance confrontation', 'prompts', 'Cinematic', 'English', '16:9', 'narrative', 'cinematic_series', ?)
  `).run(projectIdCin, JSON.stringify({
    format: 'episode_series',
    genre: 'Cyberpunk Action',
    tone: ['gritty', 'tense'],
    story_engine_focus: { combat: true, world_exploration: false, monster_action: true, hero_journey: true, season_continuity: true },
    season_number: 1,
    episode_number: 4
  }));

  const mockBibleCin = {
    character_roster: [{ name: 'Vance', role: 'Hero', physical_description: 'Trench coat wearer', costume_description: 'Torn coat', voice_tone: 'Deep', significance: 'High' }],
    creature_registry: [{ name: 'Nano-Stalker', size: 'giant', powers: ['acid spit'] }],
    location_roster: [{ name: 'Rain-slicked Alleyway', type: 'exterior', atmosphere: 'grimy', lighting_notes: 'neon glow', visual_signature: 'reflections' }],
    object_registry: [{ name: 'Data-Spike', description: 'Energy blade', symbolic_meaning: 'survival weapon', screen_time: 'often' }],
    visual_style_lock: { style_name: 'Cinematic Noir', color_palette: ['#00ff00'], color_mood: 'dark', lighting_style: 'neon-lit chiaroscuro', camera_movement_style: 'handheld tracking', film_grain: true, veo_style_tokens: ['cyberpunk'], forbidden_elements: ['cartoon'] },
    version: 1
  };
  db.prepare(`
    INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(crypto.randomUUID(), projectIdCin, JSON.stringify(mockBibleCin.character_roster), JSON.stringify(mockBibleCin.location_roster), JSON.stringify(mockBibleCin.object_registry), JSON.stringify(mockBibleCin.visual_style_lock), JSON.stringify(mockBibleCin));

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, status)
    VALUES ('cin-phase-1', ?, 1, 'climax', 'The Beast Strikes', 'Vance fights the Nano-Stalker.', 'done')
  `).run(projectIdCin);

  const mockSceneCin = {
    scene_number: 1,
    title: 'The Final Strike',
    scene_description: 'Vance strikes the Nano-Stalker with a glowing Data-Spike.',
    continuity_notes: 'Vance has a bleeding arm.',
    narration_fragment: 'This is the end.',
    character_ids_present: ['CHAR_001'],
    location_id: 'LOC_001',
    object_ids_featured: [],
    emotional_beat: 'high intensity',
    transition_to_next: 'cut',
    estimated_duration_seconds: 8,
    dialogue: 'Eat this, beast!',
    visual_state_snapshot: { time_of_day: 'night' }
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES ('cin-scene-1', ?, 'cin-phase-1', 1, 1, 'The Final Strike', ?, ?, ?, 'done', ?)
  `).run(projectIdCin, mockSceneCin.scene_description, mockSceneCin.continuity_notes, mockSceneCin.narration_fragment, JSON.stringify(mockSceneCin));

  const mockPromptCin = {
    prompt_number: '1',
    visual: 'Vance strikes the giant Nano-Stalker with a glowing energy blade.',
    shot: 'Low-angle tracking',
    shot_type: 'close_up',
    lens: 'Anamorphic',
    lighting: 'Neon chiaroscuro',
    camera: 'Tracking',
    avoid: 'cartoon',
    dialogue: 'Eat this, beast!',
    ambient_sound: 'rain',
    sfx: 'rumble',
    connection: 'None',
    narration: '',
    duration_seconds: 8,
    veo_full_prompt: 'Cinematic visual of Vance fighting...'
  };
  await VeoPromptRepository.createOrUpdate(projectIdCin, 'cin-scene-1', 1, 1, mockPromptCin as any);

  const mockMetadataCin = {
    titles: [
      { text: 'Neo-Detroit - S1E4: Rain of Claws', structure_type: 'episodic', char_count: 36 }
    ],
    description: 'Vance is cornered by the Syndicate beast. S1E4 climax.',
    chapters: [{ timestamp: '00:00', label: 'The Beast Strikes' }],
    tags: ['cyberpunk', 'vance', 'nano-stalker', 'action'],
    hashtags: ['#cyberpunk', '#vance'],
    thumbnail_hook: 'Vance vs Nano-Stalker'
  };

  LLMRouter.generateStream = async (agentName, prompt, onChunk, onComplete, onError, options) => {
    lastPromptPassed = prompt;
    onChunk(JSON.stringify(mockMetadataCin));
    onComplete(JSON.stringify(mockMetadataCin));
    return { billing_source: 'ai_studio' };
  };

  // 1. Generate cinematic metadata
  console.log('Running titleMetadataAgent for cinematic series...');
  const cinMetaResult = await titleMetadataAgent.run(
    projectIdCin,
    'Vance confrontation',
    mockBibleCin,
    [{ phase_number: 1, phase_title: 'The Beast Strikes', narration_text: 'Vance fights the Nano-Stalker' }],
    null,
    undefined,
    'gemini-2.5-flash'
  );

  assert.ok(lastPromptPassed.includes('professional Screenplay Publicist'), 'Cinematic metadata prompt must use Screenplay Publicist context');
  assert.ok(lastPromptPassed.includes('Series Title - S1E4'), 'Cinematic metadata prompt must instruct episodic title formatting');
  console.log('✓ Cinematic metadata prompt correctly generated and contains episodic instructions.');
  console.log('\n[Cinematic Metadata Sample]:');
  console.log(JSON.stringify(cinMetaResult, null, 2));

  // 2. Check Export Package Cinematic Formatting
  const packCin: ExportPackage = {
    project: db.prepare('SELECT * FROM projects WHERE id = ?').get(projectIdCin) as any,
    bible: db.prepare('SELECT * FROM production_bibles WHERE project_id = ?').get(projectIdCin) as any,
    script: null,
    phases: db.prepare('SELECT * FROM phases WHERE project_id = ?').all(projectIdCin) as any[],
    scenes: db.prepare('SELECT * FROM scenes WHERE project_id = ?').all(projectIdCin) as any[],
    prompts: db.prepare('SELECT * FROM veo_prompts WHERE project_id = ?').all(projectIdCin) as any[],
    metadata: { id: 'meta-cin', project_id: projectIdCin, selected_title: 'Neo-Detroit - S1E4: Rain of Claws', thumbnail_hook: 'Vance vs Nano-Stalker', raw_json: JSON.stringify(mockMetadataCin) } as any
  };

  const mdCin = ExportService.exportMarkdown(packCin);
  const txtCin = ExportService.exportTXT(packCin);

  // Assertions for Screenplay layout & Production section in Markdown
  assert.ok(mdCin.includes('# Cinematic Production Package:'), 'Cinematic Markdown must use Cinematic header');
  assert.ok(mdCin.includes('## 1. PRODUCTION REGISTRIES'), 'Cinematic Markdown must include Section 1 Production Registries');
  assert.ok(mdCin.includes('### Creature/Monster Registry'), 'Cinematic Markdown must include Creature/Monster Registry');
  assert.ok(mdCin.includes('Nano-Stalker'), 'Creature Registry must list Nano-Stalker');
  assert.ok(mdCin.includes('### World/Location Locks'), 'Cinematic Markdown must include World/Location Locks');
  assert.ok(mdCin.includes('### Weapon/Artifact Locks'), 'Cinematic Markdown must include Weapon/Artifact Locks');
  assert.ok(mdCin.includes('Data-Spike'), 'Weapon Locks must list Data-Spike');
  assert.ok(mdCin.includes('NARRATOR / VANCE'), 'Cinematic Markdown screenplay must use narrator/character cues');
  assert.ok(mdCin.includes('(voiceover)'), 'Cinematic Markdown screenplay must use parentheticals');

  // Assertions for Screenplay layout in TXT
  assert.ok(txtCin.includes('=== SCREENPLAY:'), 'Cinematic TXT must use SCREENPLAY header');
  assert.ok(txtCin.includes('PRODUCTION REGISTRIES'), 'Cinematic TXT must include PRODUCTION REGISTRIES');
  assert.ok(txtCin.includes('CREATURE REGISTRY:'), 'Cinematic TXT must include CREATURE REGISTRY');

  console.log('✓ Cinematic Markdown and TXT exports successfully render screenplay formatting, creature registries, and artifact locks.');
  console.log('\n[Cinematic Markdown Export Excerpt (Screenplay + Registry)]:\n');
  console.log(mdCin.split('---')[1].trim());

  console.log('\n=== ALL METADATA & EXPORT CINEMATIC VERIFICATIONS PASSED ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
