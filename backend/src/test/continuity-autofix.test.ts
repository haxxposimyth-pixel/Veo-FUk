import { LLMRouter } from '../services/llm-router';
import { continuityAgent } from '../agents/continuity-agent';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { validatePrompt } from '../utils/veo-validation';
import { checkAvoidContradiction, assembleVeoFullPrompt } from '../agents/veo-agent';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import assert from 'assert';

console.log('Running Continuity Auto-Fix Integration Tests...');

// Ensure database migrations have run
try {
  runMigrations();
} catch (e) {
  // Ignore or log
}

void (async () => {
  const projectId = 'test-autofix-project';
  const phaseId = 'test-autofix-phase';
  const sceneId = 'test-autofix-scene';
  const warningId = 'test-autofix-warning';

  // Set up clean database state
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM continuity_warnings WHERE project_id = ?').run(projectId);

  // 1. Create Mock Project
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, 'Test Auto-Fix Project', 'Continuity testing', 'prompts', 'Cinematic', 'English', '16:9')
  `).run(projectId);

  // 2. Create Mock Bible
  const mockBible = {
    character_roster: [
      {
        id: 'CHAR_001',
        name: 'Sarah',
        role: 'Protagonist',
        physical_description: 'Tall blonde woman',
        costume_description: 'Blue jacket',
        appearance_lock: {
          primary_clothing: 'Blue jacket',
          clothing_colors: ['blue'],
          forbidden_appearance_changes: ['red jacket', 'change jacket color']
        }
      }
    ],
    location_roster: [],
    object_registry: [],
    visual_style_lock: {
      style_name: 'Cinematic',
      forbidden_elements: ['flat shading', 'cartoon style'],
      veo_style_tokens: []
    },
    version: 2
  };
  db.prepare(`
    INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
    VALUES (?, ?, ?, '[]', '[]', ?, ?, 2)
  `).run('test-bible-id', projectId, JSON.stringify(mockBible.character_roster), JSON.stringify(mockBible.visual_style_lock), JSON.stringify(mockBible));

  // 3. Create Phase
  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, status)
    VALUES (?, ?, 1, 'hook', 'Introduction', 'Sarah enters the room wearing a blue jacket.', 'done')
  `).run(phaseId, projectId);

  // 4. Create Scene
  const mockScene = {
    scene_number: 1,
    title: 'Sarah Enters',
    scene_description: 'Sarah enters the room wearing a red jacket.',
    continuity_notes: 'Sarah should be wearing her locked blue jacket.',
    narration_fragment: 'She enters slowly, looking around the quiet room.',
    character_ids_present: ['CHAR_001'],
    location_id: 'LOC_001',
    object_ids_featured: [],
    emotional_beat: 'Curiosity',
    transition_to_next: 'Cut to next scene',
    estimated_duration_seconds: 6,
    is_dialogue: false,
    is_action: true,
    narration_word_count: 9
  };
  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, status, raw_json)
    VALUES (?, ?, ?, 1, 1, 'Sarah Enters', 'Sarah enters the room wearing a red jacket.', 'Sarah should be wearing her locked blue jacket.', 'She enters slowly, looking around the quiet room.', 'done', ?)
  `).run(sceneId, projectId, phaseId, JSON.stringify(mockScene));

  // 5. Create Veo Prompt
  const mockPrompt = {
    prompt_number: '1',
    visual: 'A tall blonde woman named Sarah wearing a bright red jacket walks into a room with soft ambient light.',
    shot: 'MS',
    shot_type: 'medium',
    lens: 'Standard Lens',
    lighting: 'Ambient Lighting',
    camera: 'Static Camera',
    ambient_sound: 'ambient silence',
    sfx: 'None',
    dialogue: 'None.',
    avoid: 'modern logo, smartphone screen, digital artifacts, motion blur, neon lights.',
    connection: 'None',
    narration: 'She enters slowly, looking around the quiet room.',
    duration_seconds: 6,
    scene_type: 'standard',
    veo_full_prompt: '',
    bible_version: 1
  };
  await VeoPromptRepository.createOrUpdate(projectId, sceneId, 1, 1, mockPrompt as any);

  // 6. Create Continuity Warning
  db.prepare(`
    INSERT INTO continuity_warnings (id, project_id, phase_id, prompt_number, field, issue, suggestion, resolved, cross_phase)
    VALUES (?, ?, ?, 1, 'visual', 'Sarah is wearing a red jacket but her appearance lock specifies a blue jacket.', 'Change red jacket to blue jacket.', 0, 0)
  `).run(warningId, projectId, phaseId);

  // Mock LLM Router for fixWarning
  const originalGenerateStream = LLMRouter.generateStream;

  LLMRouter.generateStream = async (
    agentName,
    prompt,
    onChunk,
    onComplete,
    onError,
    options
  ) => {
    assert.strictEqual(agentName, 'Continuity Agent');
    onChunk('{"corrected_value": "A tall blonde woman named Sarah wearing a bright blue jacket walks into a room with soft ambient light."}');
    onComplete('{"corrected_value": "A tall blonde woman named Sarah wearing a bright blue jacket walks into a room with soft ambient light."}');
    return { billing_source: 'ai_studio' };
  };

  try {
    // Retrieve the warning and other models
    const warning = ContinuityRepository.getById(warningId);
    console.log('Warning retrieved:', warning);

    const allPrompts = db.prepare('SELECT * FROM veo_prompts WHERE project_id = ?').all(projectId);
    console.log('Prompts in database:', allPrompts);

    assert.ok(warning);
    assert.strictEqual(warning.resolved, 0);

    const promptRow = db.prepare('SELECT * FROM veo_prompts WHERE project_id = ? AND prompt_number = ?').get(projectId, String(warning.prompt_number)) as any;
    assert.ok(promptRow);

    const sceneRow = SceneRepository.findById(promptRow.scene_id);
    assert.ok(sceneRow);

    const bible = BibleRepository.findByProjectId(projectId);
    assert.ok(bible);

    const settings = SettingsRepository.getSettings();

    const promptData = JSON.parse(promptRow.raw_json);
    const sceneData = JSON.parse(sceneRow.raw_json);
    const bibleData = JSON.parse(bible.raw_json);

    // Call continuityAgent.fixWarning
    const correctedValue = await continuityAgent.fixWarning(
      promptData,
      sceneData,
      bibleData,
      warning,
      settings.apiKey,
      settings.model
    );

    assert.strictEqual(correctedValue, "A tall blonde woman named Sarah wearing a bright blue jacket walks into a room with soft ambient light.");

    // Update prompt data
    promptData[warning.field] = correctedValue;

    // Validate prompt
    const validatedData = validatePrompt(promptData, bibleData, { id: projectId } as any, promptRow.scene_number, promptRow.phase_number) as any;
    const { hasContradiction } = checkAvoidContradiction(validatedData.visual || "", validatedData.avoid || "");
    validatedData.avoid_contradiction = hasContradiction ? 1 : 0;
    validatedData.veo_full_prompt = assembleVeoFullPrompt(validatedData, promptRow.prompt_number, sceneRow.title);

    // Update in DB
    const updated = await VeoPromptRepository.updateById(promptRow.id, validatedData);
    assert.ok(updated);
    const updatedData = JSON.parse(updated.raw_json);
    assert.strictEqual(updatedData.visual, "A tall blonde woman named Sarah wearing a bright blue jacket walks into a room with soft ambient light.");

    // Resolve warning in DB
    ContinuityRepository.resolve(warningId, true);

    const warningAfter = ContinuityRepository.getById(warningId);
    assert.ok(warningAfter);
    assert.strictEqual(warningAfter.resolved, 1);

    console.log('  ✓ Test passed: Warning fixed, prompt updated with corrected value, warning marked resolved.');
    process.exit(0);
  } catch (err: any) {
    console.error('  ✗ Test failed:', err);
    process.exit(1);
  } finally {
    LLMRouter.generateStream = originalGenerateStream;
  }
})();
