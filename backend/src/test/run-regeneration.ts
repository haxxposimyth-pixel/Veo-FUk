process.env.DB_PATH = './backend/data/viral-video-studio.db';

import db from '../db/connection';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { sceneAgent } from '../agents/scene-agent';
import { veoAgent } from '../agents/veo-agent';
import { ExportService } from '../services/export.service';

async function main() {
  console.log('=== RUNNING REGENERATION TEST ON CONTAINER-SHIP PROJECT ===\n');

  const projectId = '645be835-1b5e-4026-9cb8-8312af2477c3';
  const phaseNumber = 1;

  const project = ProjectRepository.findById(projectId) as any;
  if (!project) throw new Error('Project not found');

  const bible = BibleRepository.findByProjectId(projectId);
  if (!bible) throw new Error('Bible not found');
  const bibleData = JSON.parse(bible.raw_json);

  const phase = ScriptRepository.findPhaseByNumber(projectId, phaseNumber);
  if (!phase) throw new Error('Phase not found');

  const settings = SettingsRepository.getSettings();

  const phaseItem = {
    phase_number: phase.phase_number,
    phase_type: phase.phase_type as any,
    phase_title: phase.phase_title,
    phase_content: phase.phase_content,
    narration_text: phase.narration_text ?? '',
    narration_word_count: phase.narration_word_count ?? 0,
    key_events: [],
    character_ids_active: [],
    location_id_primary: '',
    estimated_duration_seconds: 0,
    viral_hook_rating: 0,
  };

  // Get old counts
  const oldScenes = db.prepare('SELECT id, scene_number, title, scene_description, narration_fragment FROM scenes WHERE project_id = ? AND phase_number = ? ORDER BY scene_number ASC').all(projectId, phaseNumber) as any[];
  const oldPrompts = db.prepare('SELECT id, prompt_number, visual, narration FROM veo_prompts WHERE project_id = ? AND phase_number = ? ORDER BY CAST(prompt_number AS INTEGER) ASC').all(projectId, phaseNumber) as any[];

  console.log(`Old Phase 1 Scene Count: ${oldScenes.length}`);
  console.log(`Old Phase 1 Prompt Count: ${oldPrompts.length}`);

  // Clear existing database entries for Phase 1
  db.prepare('DELETE FROM scenes WHERE project_id = ? AND phase_number = ?').run(projectId, phaseNumber);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ? AND phase_number = ?').run(projectId, phaseNumber);
  db.prepare('UPDATE phases SET scenes_generated = 0 WHERE project_id = ? AND phase_number = ?').run(projectId, phaseNumber);

  console.log('\n--- 1. Generating Scenes via SceneAgent ---');
  const result = await sceneAgent.run(
    phaseItem,
    bibleData,
    projectId,
    phaseNumber,
    0,
    undefined,
    undefined,
    { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
    (chunk) => process.stdout.write(chunk),
    null
  );

  // Save generated scenes to database
  const phaseId = db.prepare('SELECT id FROM phases WHERE project_id = ? AND phase_number = ?').get(projectId, phaseNumber) as { id: string };
  SceneRepository.createOrUpdateBatch(projectId, phaseId.id, phaseNumber, result.scenes);
  db.prepare('UPDATE phases SET scenes_generated = 1 WHERE project_id = ? AND phase_number = ?').run(projectId, phaseNumber);

  // Fetch saved scenes
  const savedScenes = db.prepare('SELECT id, scene_number, title, scene_description, narration_fragment, raw_json FROM scenes WHERE project_id = ? AND phase_number = ? ORDER BY scene_number ASC').all(projectId, phaseNumber) as any[];
  console.log(`\nNew Phase 1 Scene Count: ${savedScenes.length}`);

  console.log('\n--- 2. Generating Prompts via VeoAgent ---');
  for (const sceneRow of savedScenes) {
    const scene = JSON.parse(sceneRow.raw_json);
    console.log(`Generating prompt for Scene ${scene.scene_number}...`);
    
    // Resolve location
    let locationDescription = scene.location_id;
    const loc = bibleData.location_roster.find((l: any) => l.id === scene.location_id);
    if (loc) {
      locationDescription = `Name: ${loc.name}, Type: ${loc.type}, Atmosphere: ${loc.atmosphere}, Lighting Notes: ${loc.lighting_notes}, Default Time: ${loc.time_of_day_default}, Visual Signature: ${loc.visual_signature}`;
    }

    // Resolve characters
    const charactersPresent = (scene.character_ids_present || []).map((charId: string) => {
      const char = bibleData.character_roster.find((c: any) => c.id === charId);
      return char ? {
        name: char.name,
        role: char.role,
        physical_description: char.physical_description,
        costume_description: char.costume_description,
        voice_tone: char.voice_tone,
        significance: char.significance
      } : { id: charId };
    });

    // Resolve objects
    const objectsFeatured = (scene.object_ids_featured || []).map((objId: string) => {
      const obj = bibleData.object_registry.find((o: any) => o.id === objId);
      return obj ? {
        name: obj.name,
        description: obj.description,
        symbolic_meaning: obj.symbolic_meaning,
        screen_time: obj.screen_time
      } : { id: objId };
    });

    const resolvedScene = {
      scene_number: scene.scene_number,
      title: scene.title,
      scene_description: scene.scene_description,
      continuity_notes: scene.continuity_notes,
      narration_fragment: scene.narration_fragment,
      location_description: locationDescription,
      characters_present: charactersPresent,
      objects_featured: objectsFeatured,
      is_dialogue: scene.is_dialogue,
      dialogue: scene.dialogue || '',
      estimated_duration_seconds: scene.estimated_duration_seconds,
      phase_number: scene.phase_number,
      language: project.narration_language || 'English',
    };

    const promptData = await veoAgent.run(
      resolvedScene,
      project,
      bibleData,
      projectId,
      phaseNumber,
      scene.scene_number,
      settings.apiKey,
      settings.model,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
    );

    await VeoPromptRepository.createOrUpdate(
      projectId,
      sceneRow.id,
      phaseNumber,
      scene.scene_number,
      promptData
    );
  }

  // Fetch saved prompts
  const savedPrompts = db.prepare('SELECT id, prompt_number, visual, narration, raw_json FROM veo_prompts WHERE project_id = ? AND phase_number = ? ORDER BY CAST(prompt_number AS INTEGER) ASC').all(projectId, phaseNumber) as any[];
  console.log(`New Phase 1 Prompt Count: ${savedPrompts.length}`);

  console.log('\n--- 3. Validation and Report ---');
  
  // 1. Output old vs new counts
  console.log(`Old Count: ${oldScenes.length} scenes, New Count: ${savedScenes.length} scenes.`);

  // 2. Sample b-roll scenes
  console.log('\nSample B-Roll/Silent Scenes (with empty narration_fragment):');
  let brollCount = 0;
  for (const s of savedScenes) {
    const data = JSON.parse(s.raw_json);
    if (!data.narration_fragment || data.narration_fragment.trim() === '') {
      brollCount++;
      console.log(`- Scene ${data.scene_number}: [${data.title}]`);
      console.log(`  Visual Description: ${data.scene_description}`);
      console.log(`  Narration Fragment: "${data.narration_fragment}" (empty)`);
      if (brollCount >= 3) break;
    }
  }

  // 3. Confirmation that lead scenes keep their VO
  console.log('\nLead Scenes (with VO):');
  let leadCount = 0;
  for (const s of savedScenes) {
    const data = JSON.parse(s.raw_json);
    if (data.narration_fragment && data.narration_fragment.trim() !== '') {
      leadCount++;
      console.log(`- Scene ${data.scene_number}: [${data.title}]`);
      console.log(`  Visual Description: ${data.scene_description}`);
      console.log(`  Narration Fragment: "${data.narration_fragment}"`);
      if (leadCount >= 2) break;
    }
  }

  // 4. Prompt numbers are sequential
  console.log('\nSequential Prompt Number Verification:');
  const promptNumbers = savedPrompts.map(p => {
    const data = JSON.parse(p.raw_json);
    return data.prompt_number;
  });
  console.log('Generated prompt_numbers:', promptNumbers);
  let isSequential = true;
  for (let i = 0; i < promptNumbers.length; i++) {
    if (parseInt(promptNumbers[i], 10) !== i + 1) {
      isSequential = false;
    }
  }
  console.log(`Are prompt numbers sequential? ${isSequential ? 'YES' : 'NO'}`);

  // 5. Export still aligns
  console.log('\n--- 4. Verifying Export alignment ---');
  try {
    const allScenes = SceneRepository.findByProjectId(projectId);
    const allPrompts = VeoPromptRepository.findByProjectId(projectId);
    const script = ScriptRepository.findByProjectId(projectId);
    const phases = ScriptRepository.findPhasesByProjectId(projectId);

    const pack = {
      project,
      bible,
      script,
      phases,
      scenes: allScenes,
      prompts: allPrompts,
    };

    const exportedJSON = ExportService.exportJSON(pack);
    const exportedObj = JSON.parse(exportedJSON);
    console.log(`Exported JSON contains ${exportedObj.scenes.length} scenes and ${exportedObj.veo_prompts.length} prompts.`);
    console.log('Export Service Alignment: PASS');
  } catch (err: any) {
    console.error('Export Service Alignment: FAIL', err);
  }

  db.close();
}

main().catch(console.error);
