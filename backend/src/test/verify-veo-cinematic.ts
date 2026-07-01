import assert from 'assert';
import { resolveContentProfile } from 'shared';
import { getVeoSystemPrompt, getVeoUserPrompt } from '../prompts/veo.prompt';
import { veoAgent } from '../agents/veo-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function runVerify() {
  console.log('=== STARTING VEO CINEMATIC RULES VERIFICATION ===\n');

  const docProfile = resolveContentProfile('documentary');
  const cinematicProfile = resolveContentProfile('cinematic_series');

  // ==========================================
  // PART A: PROMPT COMPILATION PARITY & NON-REGRESSION
  // ==========================================
  console.log('--- PART A: Prompt Compilation & Non-Regression Checks ---');

  const mockProject = {
    topic: 'Test Topic',
    visual_style: 'Cinematic Noir',
    narration_language: 'English',
    aspect_ratio: '16:9',
    content_profile: 'documentary'
  };

  const mockBible = {
    visual_style_lock: {
      color_palette: ['#000000', '#ffffff'],
      color_mood: 'moody',
      camera_movement_style: 'slow dolly',
      lighting_style: 'chiaroscuro',
      veo_style_tokens: ['neon', 'dramatic shadow'],
      forbidden_elements: ['bright colors'],
      film_grain: true,
      aspect_ratio: '16:9'
    },
    location_roster: [{ name: 'Dark Room', type: 'interior' }],
    object_registry: [{ name: 'Old Key', category: 'hero', is_hero_prop: true }],
    character_roster: [
      {
        id: 'CHAR_001',
        name: 'Vance',
        appearance_lock: {
          approximate_age: '30',
          ethnicity: 'caucasian',
          gender: 'male',
          skin_tone: 'fair',
          hair: 'dark',
          eyes: 'brown',
          face_structure: 'square',
          primary_clothing: 'trench coat',
          clothing_colors: ['black'],
          clothing_era: 'modern',
          accessories: 'none',
          forbidden_appearance_changes: []
        }
      }
    ]
  };

  const mockScene = {
    title: 'The Room',
    scene_number: 1,
    phase_number: 1,
    narration_fragment: 'I walked into the dark room.',
    emotional_beat: 'tense discovery',
    scene_description: 'Vance steps slowly into the shadowy room, searching for the key.',
    continuity_notes: 'None.',
    transition_to_next: 'Fades to black.',
    location_description: 'Dark, dimly-lit room.',
    characters_present: [{ character_id: 'CHAR_001', name: 'Vance' }],
    objects_featured: [{ id: 'OBJ_001', name: 'Old Key' }],
    visual_state_snapshot: JSON.stringify({
      characters_present: [
        {
          character_id: 'CHAR_001',
          current_position: 'standing left',
          props_held: [],
          physical_condition: 'exerted',
          facing_direction: 'facing front'
        }
      ],
      location_state: 'same',
      time_of_day: 'night',
      weather_or_atmosphere: 'dark',
      key_objects_visible: [],
      character_damage: {
        'CHAR_001': 'slash wound on arm'
      },
      costume_armor_state: {
        'CHAR_001': 'torn coat'
      },
      creature_states: [
        {
          name: 'Nano-Stalker',
          status: 'injured',
          powers_active: true
        }
      ],
      environmental_destruction: 'debris on floor'
    })
  };

  // 1. Verify Documentary prompt has documentary rules
  const systemPromptDoc = getVeoSystemPrompt(mockProject, mockBible, docProfile);
  assert.ok(systemPromptDoc.includes('STRICT OBSERVATIONAL REALISM (HARD RULE)'), 'Documentary must have strict realism rule');
  assert.ok(systemPromptDoc.includes('OBSERVATIONAL FRAMING & DEPTH LAYERING (HARD RULE)'), 'Documentary must have observational framing rule');
  assert.ok(!systemPromptDoc.includes('## CINEMATIC SERIES PIPELINE RULES'), 'Documentary must NOT contain cinematic rules');
  console.log('✓ Documentary system prompt has correct rules.');

  // 2. Verify Cinematic prompt has cinematic rules
  const mockProjectCinematic = { ...mockProject, content_profile: 'cinematic_series' };
  const systemPromptCinematic = getVeoSystemPrompt(mockProjectCinematic, mockBible, cinematicProfile);
  assert.ok(systemPromptCinematic.includes('CINEMATIC FLOURISH & DRAMATIC STYLE'), 'Cinematic must have cinematic style rule');
  assert.ok(systemPromptCinematic.includes('CINEMATIC COMPOSITION & DRAMATIC ANGLES'), 'Cinematic must have cinematic composition rule');
  assert.ok(systemPromptCinematic.includes('## CINEMATIC SERIES PIPELINE RULES'), 'Cinematic must contain cinematic rules block');
  assert.ok(systemPromptCinematic.includes('Note: "cinematic", "lens flare", "depth of field", and "bokeh" are allowed'), 'Cinematic must allow technical camera terms');
  console.log('✓ Cinematic system prompt has correct rules.');

  // 3. Verify User Prompt extended snapshot formatting for Cinematic
  const userPromptDoc = getVeoUserPrompt(mockScene, mockBible.visual_style_lock, null, [], [], [], undefined, undefined, undefined, docProfile);
  assert.ok(!userPromptDoc.includes('## CURRENT SCENE VISUAL CONTINUITY STATE'), 'Documentary user prompt must NOT contain visual continuity state section');

  const userPromptCinematic = getVeoUserPrompt(mockScene, mockBible.visual_style_lock, null, [], [], [], undefined, undefined, undefined, cinematicProfile);
  assert.ok(userPromptCinematic.includes('## CURRENT SCENE VISUAL CONTINUITY STATE (MUST BE DEPICTED IN THE VISUAL PROMPT)'), 'Cinematic user prompt must contain visual continuity state section');
  assert.ok(userPromptCinematic.includes('- Character CHAR_001: slash wound on arm'), 'Cinematic user prompt must format character damage');
  assert.ok(userPromptCinematic.includes('- Character CHAR_001: torn coat'), 'Cinematic user prompt must format costume state');
  assert.ok(userPromptCinematic.includes('- Nano-Stalker: status=injured, powers_active=true'), 'Cinematic user prompt must format creature status');
  assert.ok(userPromptCinematic.includes('debris on floor'), 'Cinematic user prompt must format environmental destruction');
  console.log('✓ Cinematic user prompt includes extended snapshot content.\n');

  // ==========================================
  // PART B: POST-PROCESSING FILTER VERIFICATION
  // ==========================================
  console.log('--- PART B: Post-Processing Filter Checks ---');

  // 1. Run Veo agent with active credentials on a real prompt run to verify post-processing
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

  const projectId = 'test_veo_cinematic_proj';
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectId);

  // Setup project in DB with cinematic profile
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
    VALUES (?, 'Cinematic Project', 'Fight with the Nano-Stalker', 'script', 'Cinematic', 'English', '16:9', 'narrative', 'cinematic_series')
  `).run(projectId);

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, narration_text, status)
    VALUES ('dummy_phase_id', ?, 1, 'hook', 'Cold Open', 'Fight scene', 'None', 'draft')
  `).run(projectId);

  // Setup scenes in DB
  const mockSceneCinematic: any = {
    ...mockScene,
    title: 'The Stalker Strikes',
    narration_fragment: 'Vance was cornered by the Syndicate beast.',
    emotional_beat: 'terror',
    scene_description: 'An epic low-angle tracking shot. Vance uses a glowing Data-Spike to strike the Nano-Stalker. Cinematic dramatic lens flare lights up Vance\'s bleeding arm, showing his torn coat and the crumbled rubble.',
    location_description: 'Rain-slicked alleyway',
    raw_json: ''
  };
  mockSceneCinematic.raw_json = JSON.stringify(mockSceneCinematic);

  const sceneId = 'test_veo_scene_id';
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sceneId,
    projectId,
    'dummy_phase_id',
    mockSceneCinematic.phase_number,
    mockSceneCinematic.scene_number,
    mockSceneCinematic.title,
    mockSceneCinematic.scene_description,
    mockSceneCinematic.continuity_notes,
    mockSceneCinematic.narration_fragment,
    mockSceneCinematic.raw_json
  );

  console.log('Running veoAgent.run for cinematic project...');
  const promptData = await veoAgent.run(
    mockSceneCinematic,
    mockProjectCinematic,
    mockBible,
    projectId,
    1,
    1,
    undefined,
    'gemini-2.5-flash'
  );

  console.log('\n--- VERIFYING CINEMATIC VOCABULARY SURVIVES ---');
  console.log(`Visual output: "${promptData.visual}"`);
  console.log(`Avoid list output: "${promptData.avoid}"`);

  // Assert that cinematic vocabulary (e.g. epic, dramatic, cinematic, lens flare, depth of field) survived
  const visualLower = promptData.visual.toLowerCase();
  assert.ok(
    visualLower.includes('epic') || visualLower.includes('dramatic') || visualLower.includes('cinematic') || visualLower.includes('lens flare') || visualLower.includes('rubble') || visualLower.includes('bleeding'),
    'Intended cinematic vocabulary, injuries, or environmental details must survive and NOT be stripped'
  );

  // Assert that copyright-safe negatives appear in the avoid list
  const avoidLower = promptData.avoid.toLowerCase();
  assert.ok(
    (avoidLower.includes('godzilla') || avoidLower.includes('star wars')) &&
    (avoidLower.includes('marvel') || avoidLower.includes('dc')) &&
    (avoidLower.includes('franchise characters') || avoidLower.includes('copyrighted designs')),
    'Copyright-safe baseline negatives must be present in avoid list'
  );

  console.log('\n=== VEO CINEMATIC RULES VERIFICATION PASSED ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
