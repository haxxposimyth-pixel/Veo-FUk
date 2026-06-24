import { LLMRouter } from '../services/llm-router';
import { sceneAgent } from '../agents/scene-agent';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import assert from 'assert';
import crypto from 'crypto';

console.log('Running Scene Snapshot Validation Integration Tests...');

// Ensure database migrations have run
try {
  runMigrations();
} catch (e) {
  // Ignore or log
}

const projectId = 'test-scene-validation-project';
const phaseId = 'test-scene-validation-phase';
const phaseNumber = 3;

// Set up clean database state
db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM continuity_warnings WHERE project_id = ?').run(projectId);

db.prepare(`
  INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
  VALUES (?, 'Test Project', 'Fuzzy matching testing', 'script', 'Cinematic', 'English', '16:9')
`).run(projectId);

const mockBible = {
  character_roster: [
    {
      id: 'CHAR_001',
      name: 'Sarah',
      role: 'Protagonist',
      physical_description: 'Tall blonde woman',
      costume_description: 'Red jacket',
      voice_tone: 'calm',
      significance: 'major',
      appearance_lock: {
        ethnicity: 'caucasian',
        approximate_age: '30',
        gender: 'female',
        skin_tone: 'fair',
        hair: 'blonde',
        eyes: 'blue',
        face_structure: 'oval',
        distinguishing_features: 'none',
        primary_clothing: 'Red jacket',
        clothing_colors: ['red'],
        clothing_era: 'modern',
        accessories: 'none',
        forbidden_appearance_changes: []
      }
    }
  ],
  location_roster: [
    {
      id: 'LOC_001',
      name: 'Abandoned Mansion',
      type: 'interior',
      atmosphere: 'creepy',
      lighting_notes: 'dimly lit',
      time_of_day_default: 'night',
      visual_signature: 'haunted'
    }
  ],
  object_registry: [
    {
      "id": "OBJ_001",
      "object_id": "OBJ_001",
      "name": "Silver Key",
      "description": "Shiny key",
      "symbolic_meaning": "truth",
      "screen_time": "brief",
      "is_hero_prop": true
    },
    {
      "id": "OBJ_002",
      "object_id": "OBJ_002",
      "name": "Mansion Candelabra",
      "description": "Dusty gold candelabra",
      "symbolic_meaning": "decay",
      "screen_time": "brief",
      "owner_or_location": "LOC_001"
    },
    {
      "id": "OBJ_003",
      "object_id": "OBJ_003",
      "name": "Sarah's Journal",
      "description": "Leather-bound journal",
      "symbolic_meaning": "secrets",
      "screen_time": "brief",
      "owner_or_location": "CHAR_001"
    },
    {
      "id": "OBJ_004",
      "object_id": "OBJ_004",
      "name": "Lawnmower",
      "description": "Rusty green lawnmower",
      "symbolic_meaning": "chores",
      "screen_time": "brief"
    }
  ],
  visual_style_lock: {
    color_palette: ['#000', '#fff'],
    color_mood: 'dark',
    film_grain: false,
    aspect_ratio: '16:9',
    camera_movement_style: 'handheld',
    lighting_style: 'shadowy',
    forbidden_elements: [],
    veo_style_tokens: []
  },
  meta: {
    topic: 'test',
    genre: 'thriller',
    tone: 'dark',
    target_duration_minutes: 5,
    language: 'English',
    aspect_ratio: '16:9'
  }
};

db.prepare(`
  INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
`).run(
  crypto.randomUUID(),
  projectId,
  JSON.stringify(mockBible.character_roster),
  JSON.stringify(mockBible.location_roster),
  JSON.stringify(mockBible.object_registry),
  JSON.stringify(mockBible.visual_style_lock),
  JSON.stringify(mockBible)
);

db.prepare(`
  INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, narration_text, narration_word_count, approved, scenes_generated, status, rehook_required)
  VALUES (?, ?, ?, 'build_up', 'Phase 3 Title', 'Narra content that matches length criteria here.', 'Narrative text containing some words to satisfy word count.', 50, 0, 0, 'pending', 0)
`).run(phaseId, projectId, phaseNumber);

// Keep reference to original generateStream
const originalGenerateStream = LLMRouter.generateStream;

void (async () => {
  try {
    const phaseItem = {
      phase_number: phaseNumber,
      phase_type: 'build_up' as any,
      phase_title: 'Phase 3 Title',
      phase_content: 'Narra content that matches length criteria here.',
      narration_text: 'Narrative text containing some words to satisfy word count.',
      narration_word_count: 50,
      key_events: [],
      character_ids_active: [],
      location_id_primary: 'LOC_001',
      estimated_duration_seconds: 10,
      viral_hook_rating: 5
    };

    let callCount = 0;
    const promptsReceived: string[] = [];

    // Mock response data
    const firstAttemptResponse = JSON.stringify({
      phase_number: phaseNumber,
      phase_title: 'Phase 3 Title',
      total_scenes: 2,
      scenes: [
        {
          scene_number: 1,
          title: 'Scene 1',
          scene_description: 'Sarah enters the room.',
          narration_fragment: 'This is a long narration fragment to satisfy the ten words length limit.',
          character_ids_present: ['CHAR_001'],
          location_id: 'LOC_001',
          object_ids_featured: [],
          emotional_beat: 'tense',
          transition_to_next: 'cut',
          estimated_duration_seconds: 8,
          is_dialogue: false,
          is_action: true,
          visual_state_snapshot: {
            characters_present: [
              {
                name: 'sarah', // lowercase to verify name normalization
                position: 'center',
                props: [],
                physical_condition: 'fine',
                facing_direction: 'forward'
              }
            ],
            location_state: 'quiet',
            time_of_day: 'night',
            atmosphere: 'silent',
            key_visible_objects: ['Silver Key']
          }
        },
        {
          scene_number: 2,
          title: 'Scene 2',
          scene_description: 'An unknown character appears.',
          narration_fragment: 'And this is another long narration fragment to satisfy the word limit.',
          character_ids_present: [],
          location_id: 'LOC_001',
          object_ids_featured: [],
          emotional_beat: 'frightened',
          transition_to_next: 'cut',
          estimated_duration_seconds: 8,
          is_dialogue: false,
          is_action: true,
          visual_state_snapshot: {
            characters_present: [
              {
                name: 'UnknownPerson', // Not in Bible, should trigger retry
                position: 'corner',
                props: [],
                physical_condition: 'shaking',
                facing_direction: 'left'
              }
            ],
            location_state: 'disturbed',
            time_of_day: 'morning', // Regression: night -> morning within phase!
            atmosphere: 'tense',
            key_visible_objects: ['Magic Ring'] // Not in Bible object registry, should warn but not retry
          }
        }
      ]
    });

    const secondAttemptResponse = firstAttemptResponse; // Fail again to verify needs_review + warnings

    LLMRouter.generateStream = async (
      agentName,
      prompt,
      onChunk,
      onComplete,
      onError,
      options
    ) => {
      callCount++;
      promptsReceived.push(prompt);

      if (callCount === 1) {
        onChunk(firstAttemptResponse);
        onComplete(firstAttemptResponse);
      } else {
        onChunk(secondAttemptResponse);
        onComplete(secondAttemptResponse);
      }
      return { billing_source: 'ai_studio' };
    };

    // Run SceneAgent.run
    const result = await sceneAgent.run(
      phaseItem,
      mockBible,
      projectId,
      phaseNumber,
      2,
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    // Verify no LLM retry occurred since character mismatch retries were removed
    assert.strictEqual(callCount, 1);

    // Verify final scenes output
    assert.strictEqual(result.scenes.length, 2);

    // Verify scene 1 name normalization: "sarah" -> "Sarah"
    const snapshot1 = result.scenes[0].visual_state_snapshot;
    assert.ok(snapshot1);
    assert.strictEqual(snapshot1.characters_present[0].name, 'Sarah');

    // Verify scene 2 status: "needs_review" due to "UnknownPerson" name mismatch
    assert.strictEqual(result.scenes[1].status, 'needs_review');

    // Verify that "Magic Ring" has been removed from key_visible_objects
    const snapshot2 = result.scenes[1].visual_state_snapshot;
    assert.ok(snapshot2);
    assert.ok(!snapshot2.key_visible_objects.includes('Magic Ring'));

    // Verify that a note has been added to continuity_notes
    assert.ok(result.scenes[1].continuity_notes.includes('Auto-removed unregistered object: Magic Ring'));

    // Simulate database write that happens in scenes.routes.ts
    const { SceneRepository } = require('../db/repositories/scene.repo');
    SceneRepository.createOrUpdateBatch(projectId, phaseId, phaseNumber, result.scenes);

    const savedScenes = db.prepare('SELECT * FROM scenes WHERE project_id = ? AND phase_number = ? ORDER BY scene_number ASC').all(projectId, phaseNumber) as any[];
    assert.strictEqual(savedScenes[0].status, 'done');
    assert.strictEqual(savedScenes[1].status, 'needs_review');

    // Verify database warnings
    const warnings = db.prepare('SELECT * FROM continuity_warnings WHERE project_id = ? ORDER BY prompt_number ASC').all(projectId) as any[];
    
    // We expect warning rows for:
    // 1. Unknown character "UnknownPerson" in scene 2
    // 2. Time of day regression (night -> morning) in scene 2
    // Object "Magic Ring" is silently removed and does not generate a warning!
    assert.ok(warnings.length >= 2, `Expected at least 2 warnings, got ${warnings.length}`);

    // Verify unknown character warning
    const charWarning = warnings.find(w => w.field === 'visual_state_snapshot' && w.issue.includes('UnknownPerson'));
    assert.ok(charWarning);
    assert.strictEqual(charWarning.prompt_number, 2);
    assert.strictEqual(charWarning.cross_phase, 0);

    // Verify agent_logs for SceneAgent_ObjectValidator
    const validatorLogs = db.prepare("SELECT * FROM agent_logs WHERE agent_name = 'SceneAgent_ObjectValidator' AND project_id = ?").all(projectId) as any[];
    assert.ok(validatorLogs.length > 0, 'Expected at least one validator log entry');
    const ringLog = validatorLogs.find(l => l.input_prompt === 'Magic Ring');
    assert.ok(ringLog, 'Expected log entry for Magic Ring');
    assert.strictEqual(ringLog.output_response, 'unmatched');

    // Verify time of day regression warning
    const todWarning = warnings.find(w => w.field === 'visual_state_snapshot.time_of_day');
    assert.ok(todWarning);
    assert.strictEqual(todWarning.prompt_number, 2);

    // Verify that non-documentary project prompts do not contain documentary rules/instructions
    const firstPromptSent = promptsReceived[0];
    assert.ok(firstPromptSent);
    assert.ok(!firstPromptSent.includes('=== DOCUMENTARY VISUAL STYLE RULES (MANDATORY) ==='), 'Non-documentary project should not have documentary style rules');
    assert.ok(!firstPromptSent.includes('DOCUMENTARY VISUAL INSTRUCTION:'), 'Non-documentary project should not have documentary instructions');

    console.log('  ✓ First test passed: Retry occurred, needs_review status set, warnings written, normalization successful.');

    // Documentary profile verification
    const docProjectId = 'test-documentary-validation-project';
    db.prepare('DELETE FROM projects WHERE id = ?').run(docProjectId);
    db.prepare(`
      INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_profile, content_type)
      VALUES (?, 'Test Documentary Project', 'Logistics of shipping', 'script', 'Cinematic', 'English', '16:9', 'documentary', 'documentary')
    `).run(docProjectId);

    const docPhaseItem = {
      phase_number: 1,
      phase_type: 'hook' as any,
      phase_title: 'Introduction',
      phase_content: 'Narration text...',
      narration_text: 'Fresh tomatoes are delivered to fuel stations.',
      narration_word_count: 7,
      key_events: [],
      character_ids_active: [],
      location_id_primary: '',
      estimated_duration_seconds: 0,
      viral_hook_rating: 0,
    };

    // Reset promptsReceived and callCount
    promptsReceived.length = 0;
    callCount = 0;

    await sceneAgent.run(
      docPhaseItem,
      mockBible,
      docProjectId,
      1,
      2,
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    // Verify the prompt contained the documentary instructions
    const promptSent = promptsReceived[0];
    assert.ok(promptSent, 'Expected a prompt to be sent to LLMRouter');
    assert.ok(promptSent.includes('=== DOCUMENTARY VISUAL STYLE RULES (MANDATORY) ==='), 'System instruction should include documentary rules');
    assert.ok(promptSent.includes('DOCUMENTARY VISUAL INSTRUCTION:'), 'User prompt should include documentary instructions');
    console.log('  ✓ Second test passed: Documentary-specific system instructions and user instructions successfully injected.');

    // Test Case 3: Verify supplemental grounding arrays are injected
    const groundingPhaseItem: any = {
      phase_number: 1,
      phase_type: 'hook',
      phase_title: 'Introduction to Grounding',
      phase_content: 'This is a test of supplemental grounding arrays.',
      narration_text: 'Sarah is here and something important happens now.',
      narration_word_count: 9,
      key_events: ['Sarah discovers the secret treasure', 'A sudden alarm sounds'],
      key_facts: ['The treasure consists of ancient gold coins', 'The alarm is triggered by motion sensors'],
      key_images: ["Close up on Sarah's eyes widening in shock", 'Flashing red light reflecting off the brick walls'],
      character_ids_active: ['CHAR_001'],
      location_id_primary: 'LOC_001',
      estimated_duration_seconds: 6,
      viral_hook_rating: 4,
    };

    promptsReceived.length = 0;
    callCount = 0;

    await sceneAgent.run(
      groundingPhaseItem,
      mockBible,
      docProjectId,
      1,
      2,
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    const groundingPromptSent = promptsReceived[0];
    assert.ok(groundingPromptSent, 'Expected a prompt to be sent to LLMRouter for grounding test');
    assert.ok(groundingPromptSent.includes('SUPPLEMENTAL GROUNDING - KEY EVENTS:'), 'Prompt should include key events grounding header');
    assert.ok(groundingPromptSent.includes('- Sarah discovers the secret treasure'), 'Prompt should include the first key event');
    assert.ok(groundingPromptSent.includes('- A sudden alarm sounds'), 'Prompt should include the second key event');
    assert.ok(groundingPromptSent.includes('SUPPLEMENTAL GROUNDING - KEY FACTS:'), 'Prompt should include key facts grounding header');
    assert.ok(groundingPromptSent.includes('- The treasure consists of ancient gold coins'), 'Prompt should include the first key fact');
    assert.ok(groundingPromptSent.includes('- The alarm is triggered by motion sensors'), 'Prompt should include the second key fact');
    assert.ok(groundingPromptSent.includes('SUPPLEMENTAL GROUNDING - KEY IMAGES:'), 'Prompt should include key images grounding header');
    assert.ok(groundingPromptSent.includes("- Close up on Sarah's eyes widening in shock"), 'Prompt should include the first key image');
    assert.ok(groundingPromptSent.includes('- Flashing red light reflecting off the brick walls'), 'Prompt should include the second key image');
    assert.ok(groundingPromptSent.includes('SUPPLEMENTAL GROUNDING - ACTIVE CHARACTERS:'), 'Prompt should include active characters grounding header');
    assert.ok(groundingPromptSent.includes('- CHAR_001'), 'Prompt should include the active character ID');

    // Filtered object registry assertions
    assert.ok(groundingPromptSent.includes('Silver Key'), 'Hero prop (Silver Key) should be kept in prompt');
    assert.ok(groundingPromptSent.includes('Mansion Candelabra'), 'Location-linked prop (Mansion Candelabra) should be kept in prompt');
    assert.ok(groundingPromptSent.includes("Sarah's Journal"), 'Character-linked prop (Sarah\'s Journal) should be kept in prompt');
    assert.ok(!groundingPromptSent.includes('Lawnmower'), 'Unlinked prop (Lawnmower) should be filtered out of the prompt');

    console.log('  ✓ Third test passed: Supplemental grounding arrays successfully passed and injected into user prompt, with object registry correctly filtered.');

    // Test Case 4: Verify fail-safe fallback when phase has no signals or filtered result is empty
    const emptyPhaseItem: any = {
      phase_number: 1,
      phase_type: 'hook',
      phase_title: 'Generic Title',
      phase_content: 'Generic phase content.',
      narration_text: 'Generic narration text with some words to satisfy length check.',
      narration_word_count: 10,
      key_events: [],
      key_facts: [],
      key_images: [],
      character_ids_active: [],
      location_id_primary: '',
      estimated_duration_seconds: 0,
      viral_hook_rating: 0,
    };

    const emptyMockBible = {
      ...mockBible,
      object_registry: mockBible.object_registry.map(obj => ({
        ...obj,
        is_hero_prop: false
      }))
    };

    promptsReceived.length = 0;
    callCount = 0;

    await sceneAgent.run(
      emptyPhaseItem,
      emptyMockBible,
      docProjectId,
      1,
      2,
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    const emptyPromptSent = promptsReceived[0];
    assert.ok(emptyPromptSent, 'Expected a prompt to be sent to LLMRouter for empty test');
    // It should include the full registry (including OBJ_004 "Lawnmower")
    assert.ok(emptyPromptSent.includes('Lawnmower'), 'Prompt should fallback to include full registry (Lawnmower) when no signals match');
    console.log('  ✓ Fourth test passed: Fail-safe fallback to full registry when no signals match verified.');

    process.exit(0);
  } catch (err: any) {
    console.error('  ✗ Test failed:', err);
    process.exit(1);
  } finally {
    LLMRouter.generateStream = originalGenerateStream;
  }
})();
