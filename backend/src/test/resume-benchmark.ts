import { sceneAgent } from '../agents/scene-agent';
import { veoAgent, assembleVeoFullPrompt } from '../agents/veo-agent';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function generateSinglePromptForBenchmark(
  projectId: string,
  sceneRow: any,
  bibleData: any,
  settings: any,
  project: any
) {
  const scene = JSON.parse(sceneRow.raw_json);

  // 1. Resolve Location ID
  let locationDescription = scene.location_id;
  const loc = bibleData.location_roster.find((l: any) => l.id === scene.location_id);
  if (loc) {
    locationDescription = `Name: ${loc.name}, Type: ${loc.type}, Atmosphere: ${loc.atmosphere}, Lighting Notes: ${loc.lighting_notes}, Default Time: ${loc.time_of_day_default}, Visual Signature: ${loc.visual_signature}`;
  }

  // 2. Resolve Characters Present
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

  // 3. Resolve Objects Featured
  const objectsFeatured = (scene.object_ids_featured || []).map((objId: string) => {
    const obj = bibleData.object_registry.find((o: any) => o.id === objId);
    return obj ? {
      name: obj.name,
      description: obj.description,
      symbolic_meaning: obj.symbolic_meaning,
      screen_time: obj.screen_time
    } : { id: objId };
  });

  // Compile fully resolved scene context object for veoAgent
  const resolvedScene = {
    title: scene.title,
    scene_number: scene.scene_number,
    phase_number: sceneRow.phase_number,
    narration_fragment: scene.narration_fragment,
    emotional_beat: scene.emotional_beat,
    scene_description: scene.scene_description,
    continuity_notes: scene.continuity_notes,
    transition_to_next: scene.transition_to_next,
    location_description: locationDescription,
    characters_present: charactersPresent,
    objects_featured: objectsFeatured
  };

  const promptData = await veoAgent.run(
    resolvedScene,
    project,
    bibleData,
    projectId,
    sceneRow.phase_number,
    sceneRow.scene_number,
    undefined,
    settings.model,
    { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
    (chunk) => {}
  );

  promptData.bible_version = bibleData.version || 1;
  VeoPromptRepository.createOrUpdate(
    projectId,
    sceneRow.id,
    sceneRow.phase_number,
    sceneRow.scene_number,
    promptData
  );

  return promptData;
}

async function main() {
  console.log('=== RESUMING BENCHMARK PIPELINE RUN ===');

  const projectId = 'benchmark-f7dc3b1b';
  const project = ProjectRepository.findById(projectId);
  if (!project) {
    console.error('Project not found');
    return;
  }
  const settings = SettingsRepository.getSettings();

  const bibleRow = BibleRepository.findByProjectId(projectId);
  if (!bibleRow) {
    console.error('Bible not found');
    return;
  }
  const bible = JSON.parse(bibleRow.raw_json);

  const dbPhases = ScriptRepository.findPhasesByProjectId(projectId);
  console.log(`Loaded ${dbPhases.length} phases from database.`);

  const hookPhase = dbPhases.find(p => p.phase_number === 1);
  const historyPhase = dbPhases.find(p => p.phase_number === 2); // Ancient India's Natural Coolers
  const technicalPhase = dbPhases.find(p => p.phase_number === 6); // The Heart That Pumps the Cool (Compressor)

  if (!hookPhase) throw new Error('Hook Phase (Phase 1) not found in database.');
  if (!historyPhase) throw new Error('History Phase (Phase 2) not found in database.');
  if (!technicalPhase) throw new Error('Technical Phase (Phase 6) not found in database.');

  console.log('\nSelected Phases for scene/prompt generation:');
  console.log(`1. Hook Phase: Phase ${hookPhase?.phase_number} (${hookPhase?.phase_title})`);
  console.log(`2. History Phase: Phase ${historyPhase?.phase_number} (${historyPhase?.phase_title})`);
  console.log(`3. Technical Phase: Phase ${technicalPhase?.phase_number} (${technicalPhase?.phase_title})`);

  const selectedPhases = [hookPhase, historyPhase, technicalPhase].filter(Boolean);

  for (const phase of selectedPhases) {
    const pNum = phase!.phase_number;
    console.log(`\n--- Generating Scenes for Phase ${pNum} ---`);
    
    const phaseItem = {
      phase_number: pNum,
      phase_type: phase!.phase_type as any,
      phase_title: phase!.phase_title,
      phase_content: phase!.phase_content,
      narration_text: phase!.narration_text ?? '',
      narration_word_count: phase!.narration_word_count ?? 0,
      key_events: [],
      character_ids_active: [],
      location_id_primary: '',
      estimated_duration_seconds: 0,
      viral_hook_rating: 0,
    };

    try {
      const sceneData = await sceneAgent.run(
        phaseItem,
        bible,
        projectId,
        pNum,
        0,
        undefined as any,
        settings.model,
        undefined,
        (chunk) => {}
      );

      SceneRepository.createOrUpdateBatch(projectId, phase!.id, pNum, sceneData.scenes);
      console.log(`Scenes generated for Phase ${pNum}: ${sceneData.scenes.length} scenes.`);

      console.log(`--- Generating Prompts for Phase ${pNum} ---`);
      const scenesInDb = SceneRepository.findByPhase(projectId, pNum);
      for (const sceneRow of scenesInDb) {
        await generateSinglePromptForBenchmark(projectId, sceneRow, bible, settings, project);
      }
      console.log(`Prompts generated for Phase ${pNum}.`);
    } catch (err: any) {
      console.error(`Error processing Phase ${pNum}:`, err.message);
    }
  }

  // Pull all prompt records from DB to do comparison analysis
  const allPrompts = VeoPromptRepository.findByProjectId(projectId);
  console.log('\n=== PIPELINE WORK COMPLETED ===');
  console.log(`Total generated Veo prompts in DB: ${allPrompts.length}`);

  // Print phase details for comparison
  console.log('\n======================================');
  console.log('SCRIPT STRUCTURE DETAILS');
  console.log('======================================');
  selectedPhases.forEach(p => {
    console.log(`\n--- Phase ${p!.phase_number}: ${p!.phase_title} (${p!.phase_type}) ---`);
    console.log(`Narrative Flow:\n${p!.phase_content}`);
    console.log(`Hindi Narration:\n${p!.narration_text}`);
  });

  console.log('\n======================================');
  console.log('VEO PROMPT DETAILS FOR SELECTED SHOTS');
  console.log('======================================');

  // 1. Cutaway Scene
  const cutawayPrompt = allPrompts.find(p => {
    const raw = JSON.parse(p.raw_json);
    const text = (raw.visual || '').toLowerCase() + ' ' + (raw.scene_description || '').toLowerCase();
    return text.includes('cutaway') || text.includes('diagram') || text.includes('internal view') || text.includes('schematic') || text.includes('evaporator') || text.includes('compressor');
  }) || allPrompts[allPrompts.length - 1]; // fallback

  if (cutawayPrompt) {
    const raw = JSON.parse(cutawayPrompt.raw_json);
    const full = assembleVeoFullPrompt(raw, cutawayPrompt.scene_number, raw.title || '');
    console.log('\n--- (a) CGI CUTAWAY / TECHNICAL PROMPT ---');
    console.log(`Phase: ${cutawayPrompt.phase_number}, Scene: ${cutawayPrompt.scene_number}`);
    console.log(full);
  }

  // 2. Historical Recreation
  const historicalPrompt = allPrompts.find(p => {
    const raw = JSON.parse(p.raw_json);
    const text = (raw.visual || '').toLowerCase() + ' ' + (raw.scene_description || '').toLowerCase();
    return text.includes('egypt') || text.includes('carrier') || text.includes('history') || text.includes('ancient') || text.includes('1902') || text.includes('1905') || text.includes('workshop');
  }) || allPrompts.find(p => p.phase_number === historyPhase.phase_number); // fallback

  if (historicalPrompt) {
    const raw = JSON.parse(historicalPrompt.raw_json);
    const full = assembleVeoFullPrompt(raw, historicalPrompt.scene_number, raw.title || '');
    console.log('\n--- (b) HISTORICAL RECREATION PROMPT ---');
    console.log(`Phase: ${historicalPrompt.phase_number}, Scene: ${historicalPrompt.scene_number}`);
    console.log(full);
  }

  // 3. Component Close-up
  const closeupPrompt = allPrompts.find(p => {
    const raw = JSON.parse(p.raw_json);
    const text = (raw.visual || '').toLowerCase() + ' ' + (raw.scene_description || '').toLowerCase() + ' ' + (raw.shot || '').toLowerCase();
    return (text.includes('close-up') || text.includes('closeup') || text.includes('macro') || text.includes('extreme close')) && p.phase_number === technicalPhase.phase_number;
  }) || allPrompts.find(p => p.phase_number === technicalPhase.phase_number); // fallback

  if (closeupPrompt) {
    const raw = JSON.parse(closeupPrompt.raw_json);
    const full = assembleVeoFullPrompt(raw, closeupPrompt.scene_number, raw.title || '');
    console.log('\n--- (c) COMPONENT CLOSE-UP PROMPT ---');
    console.log(`Phase: ${closeupPrompt.phase_number}, Scene: ${closeupPrompt.scene_number}`);
    console.log(full);
  }
}

main().catch(console.error);
