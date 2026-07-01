import assert from 'assert';
import { LLMRouter } from '../services/llm-router';
import { continuityAgent } from '../agents/continuity-agent';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function runVerify() {
  console.log('=== STARTING CONTINUITY CINEMATIC VERIFICATION ===\n');

  // =========================================================================
  // PART A: NON-REGRESSION (NON-CINEMATIC / DOCUMENTARY)
  // =========================================================================
  console.log('--- PART A: Non-Regression Check (Documentary) ---');

  const projectIdDoc = 'test_continuity_doc_proj';
  const phaseIdDoc = 'test_continuity_doc_phase';
  const sceneIdDoc = 'test_continuity_doc_scene';
  const warningIdDoc = 'test_continuity_doc_warning';

  // Setup clean database state
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdDoc);
  db.prepare('DELETE FROM continuity_warnings WHERE project_id = ?').run(projectIdDoc);

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
    VALUES (?, 'Doc Project', 'Observed wildlife in Alaska', 'prompts', 'Documentary', 'English', '16:9', 'documentary', 'documentary')
  `).run(projectIdDoc);

  const mockBibleDoc = {
    character_roster: [{ name: 'Grizzly Bear', role: 'Subject' }],
    location_roster: [],
    visual_style_lock: { style_name: 'Documentary', forbidden_elements: [], veo_style_tokens: [] }
  };
  db.prepare(`
    INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
    VALUES (?, ?, ?, '[]', '[]', ?, ?, 1)
  `).run('doc-bible-id', projectIdDoc, JSON.stringify(mockBibleDoc.character_roster), JSON.stringify(mockBibleDoc.visual_style_lock), JSON.stringify(mockBibleDoc));

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, status)
    VALUES (?, ?, 1, 'hook', 'Cold Open', 'Wildlife description', 'done')
  `).run(phaseIdDoc, projectIdDoc);

  const mockSceneDoc = {
    scene_number: 1,
    title: 'Bear Fishing',
    scene_description: 'A grizzly bear fishing in a river.',
    continuity_notes: '',
    narration_fragment: 'The bear watches the salmon.',
    character_ids_present: [],
    location_id: 'LOC_001',
    object_ids_featured: [],
    emotional_beat: 'calm',
    transition_to_next: 'cut',
    estimated_duration_seconds: 8
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES (?, ?, ?, 1, 1, 'Bear Fishing', ?, '', ?, 'done', ?)
  `).run(sceneIdDoc, projectIdDoc, phaseIdDoc, mockSceneDoc.scene_description, mockSceneDoc.narration_fragment, JSON.stringify(mockSceneDoc));

  const mockPromptDoc = {
    prompt_number: '1',
    visual: 'A large grizzly bear stands in the cold Alaskan river, scanning the water for salmon.',
    shot: 'Wide',
    shot_type: 'wide',
    lens: 'Telephoto Lens',
    lighting: 'Overcast Daylight',
    camera: 'Panning Camera',
    ambient_sound: 'river rushing',
    sfx: 'None',
    dialogue: 'None.',
    avoid: 'modern logo, smartphone screen, digital artifacts, motion blur, neon lights.',
    connection: 'None',
    narration: 'The bear watches the salmon.',
    duration_seconds: 8
  };
  await VeoPromptRepository.createOrUpdate(projectIdDoc, sceneIdDoc, 1, 1, mockPromptDoc as any);

  // Mock LLM Router for run & fixWarning
  const originalGenerateStream = LLMRouter.generateStream;

  let lastSystemInstruction = '';
  let lastUserPrompt = '';

  LLMRouter.generateStream = async (agentName, prompt, onChunk, onComplete, onError, options) => {
    lastSystemInstruction = prompt;
    lastUserPrompt = prompt;
    if (prompt.includes('Review these prompts')) {
      onChunk('{"warnings": []}');
      onComplete('{"warnings": []}');
    } else {
      onChunk('{"corrected_value": "Corrected documentary visual prompt."}');
      onComplete('{"corrected_value": "Corrected documentary visual prompt."}');
    }
    return { billing_source: 'ai_studio' };
  };

  const docRes = await continuityAgent.run(
    [mockPromptDoc as any],
    mockBibleDoc as any,
    projectIdDoc,
    undefined,
    'gemini-2.5-flash',
    undefined,
    undefined,
    true
  );

  assert.ok(docRes.warnings.length === 0);
  assert.ok(!lastSystemInstruction.includes('ADDITIONAL CINEMATIC CONTINUITY RULES'), 'Documentary scan must not contain cinematic rules');
  assert.ok(!lastUserPrompt.includes('creature_registry'), 'Documentary scan must not pass creature registry');
  console.log('✓ Documentary scan did not include cinematic rules or creature registries.');

  // Test fixWarning for Documentary
  const warningDoc = { id: warningIdDoc, project_id: projectIdDoc, prompt_number: 1, field: 'visual', issue: 'test issue', suggestion: 'make better' };
  const docFixVal = await continuityAgent.fixWarning(
    mockPromptDoc as any,
    mockSceneDoc,
    mockBibleDoc as any,
    warningDoc,
    undefined,
    'gemini-2.5-flash'
  );
  assert.strictEqual(docFixVal, 'Corrected documentary visual prompt.');
  assert.ok(!lastUserPrompt.includes('Visual State Snapshot'), 'Documentary fix must not include visual state snapshots');
  console.log('✓ Documentary fix did not include visual state snapshots.');


  // =========================================================================
  // PART B: CINEMATIC CONTINUITY (CINEMATIC SERIES)
  // =========================================================================
  console.log('\n--- PART B: Cinematic Continuity Check (Cinematic Series) ---');

  const projectIdCin = 'test_continuity_cin_proj';
  const phaseIdCin = 'test_continuity_cin_phase';
  const warningIdCin1 = 'test_continuity_warning_cin1';
  const warningIdCin2 = 'test_continuity_warning_cin2';

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectIdCin);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectIdCin);
  db.prepare('DELETE FROM continuity_warnings WHERE project_id = ?').run(projectIdCin);

  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
    VALUES (?, 'Cinematic Movie', 'Vance vs the Syndicate Stalker', 'prompts', 'Cinematic', 'English', '16:9', 'narrative', 'cinematic_series')
  `).run(projectIdCin);

  const mockBibleCin = {
    character_roster: [{ name: 'Vance', role: 'Hero' }],
    location_roster: [],
    creature_registry: [
      { name: 'Nano-Stalker', size: 'giant, twice the height of Vance', powers: ['acid spit', 'extreme speed'] }
    ],
    visual_style_lock: { style_name: 'Cinematic Noir', forbidden_elements: [], veo_style_tokens: [] }
  };
  db.prepare(`
    INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
    VALUES (?, ?, ?, '[]', '[]', ?, ?, 1)
  `).run('cin-bible-id', projectIdCin, JSON.stringify(mockBibleCin.character_roster), JSON.stringify(mockBibleCin.visual_style_lock), JSON.stringify(mockBibleCin));

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, status)
    VALUES (?, ?, 1, 'climax', 'The Final Confrontation', 'Vance fights the Nano-Stalker.', 'done')
  `).run(phaseIdCin, projectIdCin);

  // Helper to create scene + prompt
  const createSceneAndPrompt = async (
    sceneNumber: number,
    sceneDesc: string,
    promptVisual: string,
    snapshot: any
  ) => {
    const sceneId = `scene_${projectIdCin}_${sceneNumber}`;
    const mockScene = {
      scene_number: sceneNumber,
      title: `Scene ${sceneNumber}`,
      scene_description: sceneDesc,
      continuity_notes: '',
      narration_fragment: '',
      character_ids_present: ['CHAR_001'],
      location_id: 'LOC_001',
      object_ids_featured: [],
      emotional_beat: 'combat',
      transition_to_next: 'cut',
      estimated_duration_seconds: 8,
      visual_state_snapshot: snapshot
    };
    db.prepare(`
      INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json, visual_state_snapshot)
      VALUES (?, ?, ?, 1, ?, ?, ?, '', '', 'done', ?, ?)
    `).run(sceneId, projectIdCin, phaseIdCin, sceneNumber, mockScene.title, sceneDesc, JSON.stringify(mockScene), JSON.stringify(snapshot));

    const mockPrompt = {
      prompt_number: String(sceneNumber),
      visual: promptVisual,
      shot: 'MCU',
      shot_type: 'close_up',
      lens: 'Anamorphic 35mm',
      lighting: 'Neon Backlighting',
      camera: 'Handheld tracking',
      ambient_sound: 'rain and wind',
      sfx: 'energy hum',
      dialogue: 'None.',
      avoid: 'deformed hands, extra limbs, franchise characters, copyrighted designs.',
      connection: 'None',
      narration: '',
      duration_seconds: 8
    };
    await VeoPromptRepository.createOrUpdate(projectIdCin, sceneId, 1, sceneNumber, mockPrompt as any);
    return { scene: mockScene, prompt: mockPrompt };
  };

  // Scene 1: Vance cornered, Nano-Stalker unharmed
  const s1 = await createSceneAndPrompt(
    1,
    'Vance is backed into a dark alleyway as the giant Nano-Stalker approaches.',
    'Vance stumbles backward in a dark, rain-soaked alleyway. The giant Nano-Stalker looms over him with red eyes.',
    {
      characters_present: [{ character_id: 'CHAR_001', current_position: 'stumbling back' }],
      location_state: 'dark alleyway',
      time_of_day: 'night',
      atmosphere: 'tense',
      character_damage: {},
      costume_armor_state: {},
      creature_states: [{ name: 'Nano-Stalker', status: 'unharmed', powers_active: true }],
      environmental_destruction: ''
    }
  );

  // Scene 2: Vance fights, gets cut on arm, Nano-Stalker gets injured
  const s2 = await createSceneAndPrompt(
    2,
    'Vance dodges a slash and strikes back with a glowing Data-Spike.',
    'Vance swings a glowing neon Data-Spike. His arm is bleeding from a slash wound, and his trench coat is torn.',
    {
      characters_present: [{ character_id: 'CHAR_001', current_position: 'slashing' }],
      location_state: 'dark alleyway',
      time_of_day: 'night',
      atmosphere: 'violent action',
      character_damage: { Vance: 'slash wound on left arm' },
      costume_armor_state: { Vance: 'torn jacket at arm' },
      creature_states: [{ name: 'Nano-Stalker', status: 'injured', powers_active: true }],
      environmental_destruction: 'crumbled brickwork'
    }
  );

  // Scene 3: Vance defeats creature, marking it 'defeated'
  const s3 = await createSceneAndPrompt(
    3,
    'Vance drives the Data-Spike into the creature, defeating it.',
    'Vance drives the Data-Spike into the beast. The Nano-Stalker collapses, lifeless.',
    {
      characters_present: [{ character_id: 'CHAR_001', current_position: 'standing victory' }],
      location_state: 'dark alleyway',
      time_of_day: 'night',
      atmosphere: 'exhausted victory',
      character_damage: { Vance: 'slash wound on left arm' },
      costume_armor_state: { Vance: 'torn jacket at arm' },
      creature_states: [{ name: 'Nano-Stalker', status: 'defeated' }],
      environmental_destruction: 'crumbled brickwork'
    }
  );

  // Scene 4: VIOLATIONS: Vance has pristine coat + no injury, Nano-Stalker is active again
  const s4 = await createSceneAndPrompt(
    4,
    'Vance walks out of the alleyway, leaving the dead beast behind.',
    'Vance walks out of the alleyway. His jacket looks pristine, and his arm is completely fine. The Nano-Stalker is seen running away behind him, active and unharmed.',
    {
      characters_present: [{ character_id: 'CHAR_001', current_position: 'walking away' }],
      location_state: 'dark alleyway',
      time_of_day: 'night',
      atmosphere: 'calming down',
      character_damage: {}, // Violation: INJURY DISCONTINUITY
      costume_armor_state: {}, // Violation: COSTUME/ARMOR DISCONTINUITY
      creature_states: [{ name: 'Nano-Stalker', status: 'unharmed' }], // Violation: DEFEATED CREATURE REAPPEARS
      environmental_destruction: 'crumbled brickwork'
    }
  );

  // Mock LLM Router to return warnings of injected violations
  LLMRouter.generateStream = async (agentName, prompt, onChunk, onComplete, onError, options) => {
    lastSystemInstruction = prompt;
    lastUserPrompt = prompt;

    if (prompt.includes('Review these prompts')) {
      const mockWarnings = {
        warnings: [
          {
            prompt_number: '4',
            field: 'visual',
            issue: 'DEFEATED CREATURE REAPPEARS: Nano-Stalker was marked as defeated in prompt 3 but appears active and unharmed in prompt 4.',
            suggestion: 'Rewrite prompt 4 to describe the Nano-Stalker remaining dead and defeated on the ground.'
          },
          {
            prompt_number: '4',
            field: 'visual',
            issue: 'INJURY DISCONTINUITY: Vance\'s slash wound on his arm vanished in prompt 4 without explanation.',
            suggestion: 'Rewrite prompt 4 to mention that Vance is still holding his bleeding arm.'
          }
        ]
      };
      onChunk(JSON.stringify(mockWarnings));
      onComplete(JSON.stringify(mockWarnings));
    } else {
      // Fix warning mock
      onChunk('{"corrected_value": "Vance walks out of the alleyway, clutching his bleeding arm where his trench coat remains torn. Behind him in the shadows, the giant Nano-Stalker lies lifeless and defeated amidst the crumbled brickwork."}');
      onComplete('{"corrected_value": "Vance walks out of the alleyway, clutching his bleeding arm where his trench coat remains torn. Behind him in the shadows, the giant Nano-Stalker lies lifeless and defeated amidst the crumbled brickwork."}');
    }
    return { billing_source: 'ai_studio' };
  };

  const promptsList = [s1.prompt, s2.prompt, s3.prompt, s4.prompt] as any[];

  console.log('Running continuityAgent.run for cinematic project...');
  const cinRes = await continuityAgent.run(
    promptsList,
    mockBibleCin as any,
    projectIdCin,
    undefined,
    'gemini-2.5-flash',
    undefined,
    undefined,
    true
  );

  // Verify that system instruction contains ADDITIONAL CINEMATIC CONTINUITY RULES
  assert.ok(lastSystemInstruction.includes('ADDITIONAL CINEMATIC CONTINUITY RULES'), 'Cinematic system instruction must contain cinematic rules');
  console.log('✓ System instruction contains the ADDITIONAL CINEMATIC CONTINUITY RULES.');

  // Verify that creature_registry was successfully passed in the Production Bible
  assert.ok(lastUserPrompt.includes('creature_registry'), 'User prompt must include creature_registry');
  assert.ok(lastUserPrompt.includes('Nano-Stalker'), 'User prompt must include Nano-Stalker details in creature_registry');
  console.log('✓ User prompt includes creature_registry with locked creature details.');

  // Verify snapshots are threaded in promptsForReview
  assert.ok(lastUserPrompt.includes('visual_state_snapshot'), 'User prompt must include visual_state_snapshot for each scene');
  assert.ok(lastUserPrompt.includes('character_damage'), 'User prompt must include character_damage in snapshots');
  assert.ok(lastUserPrompt.includes('creature_states'), 'User prompt must include creature_states in snapshots');
  console.log('✓ Visual state snapshots with injury, costume, creature states are successfully threaded.');

  // Verify warnings retrieved
  assert.strictEqual(cinRes.warnings.length, 2);
  console.log('\n[Flagged Warnings]:');
  for (const w of cinRes.warnings) {
    console.log(`- Prompt ${w.prompt_number} [${w.field}]: ${w.issue}\n  Suggestion: ${w.suggestion}`);
    assert.strictEqual(w.prompt_number, '4');
    db.prepare(`
      INSERT INTO continuity_warnings (id, project_id, phase_id, prompt_number, field, issue, suggestion, resolved, cross_phase)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
    `).run(crypto.randomUUID(), projectIdCin, phaseIdCin, parseInt(w.prompt_number), w.field, w.issue, w.suggestion);
  }

  // Retrieve saved warnings and verify fixWarning
  const warningsInDb = ContinuityRepository.findByProject(projectIdCin);
  assert.strictEqual(warningsInDb.length, 2);

  console.log('\nRunning fixWarning for first cinematic warning...');
  const firstWarning = warningsInDb[0];
  const fixedVal = await continuityAgent.fixWarning(
    s4.prompt as any,
    s4.scene,
    mockBibleCin as any,
    firstWarning,
    undefined,
    'gemini-2.5-flash'
  );

  // Verify snapshot was injected into fixWarning user prompt
  assert.ok(lastUserPrompt.includes('Visual State Snapshot'), 'Fix user prompt must include Visual State Snapshot');
  assert.ok(lastUserPrompt.includes('creature_states'), 'Fix user prompt must contain creature_states in snapshot');
  console.log('✓ Visual state snapshot was successfully injected into fixWarning user prompt.');

  console.log(`\n[Auto-fixed Value]: "${fixedVal}"`);
  assert.strictEqual(fixedVal, "Vance walks out of the alleyway, clutching his bleeding arm where his trench coat remains torn. Behind him in the shadows, the giant Nano-Stalker lies lifeless and defeated amidst the crumbled brickwork.");

  console.log('\n=== ALL CONTINUITY CINEMATIC VERIFICATIONS PASSED ===');
}

runVerify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
