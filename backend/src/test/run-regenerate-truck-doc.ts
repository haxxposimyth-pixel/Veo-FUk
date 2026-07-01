import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent } from '../agents/script-agent';
import { sceneAgent } from '../agents/scene-agent';
import { veoAgent } from '../agents/veo-agent';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { StoryPlanRepository } from '../db/repositories/storyplan.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';

async function main() {
  console.log('=== REGENERATING HIMALAYAN TRUCK DOCUMENTARY PIPELINE ===');

  try {
    runMigrations();
  } catch (e) {}

  const projectId = 'e5fab29d-7018-4c44-a778-be5dc5d7928d';
  const project = ProjectRepository.findById(projectId);
  if (!project) {
    console.error(`Project ${projectId} not found!`);
    return;
  }

  console.log(`Loaded project: "${project.title}"`);
  console.log(`Topic: "${project.topic}"`);
  console.log(`Visual Style: "${project.visual_style}"`);
  console.log(`Language: "${project.narration_language}"`);
  console.log(`Aspect Ratio: "${project.aspect_ratio}"`);

  // Clear existing entries for this project to start fresh
  console.log('\nClearing existing database rows for this project...');
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM story_plans WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectId);

  const settings = SettingsRepository.getSettings();

  try {
    console.log('\n--- 1. Generating Story Plan ---');
    const storyPlan = await storyPlannerAgent.run(
      project.topic,
      project.visual_style,
      project.narration_language,
      project.aspect_ratio,
      projectId,
      undefined,
      settings.model,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
      (chunk) => process.stdout.write(chunk),
      project.youtube_transcript || undefined,
      project.content_type || 'auto',
      undefined,
      project.content_profile || 'viral_story'
    );
    StoryPlanRepository.createOrUpdate(projectId, storyPlan);
    console.log('\nStory Plan Generated and Saved.');

    console.log('\n--- 2. Generating Production Bible ---');
    const bible = await productionBibleAgent.run(
      project.topic,
      project.visual_style,
      project.narration_language,
      project.aspect_ratio,
      projectId,
      undefined,
      settings.model,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
      (chunk) => process.stdout.write(chunk),
      project.youtube_transcript || undefined,
      storyPlan
    );
    BibleRepository.createOrUpdate(projectId, bible);
    console.log('\nProduction Bible Generated and Saved.');

    console.log('\n--- 3. Generating Script ---');
    const script = await scriptAgent.run(
      project.topic,
      bible,
      projectId,
      undefined,
      settings.model,
      { target_duration_minutes: project.target_duration_minutes || 8 },
      (chunk) => process.stdout.write(chunk),
      project.youtube_transcript || undefined
    );
    ScriptRepository.createOrUpdate(projectId, script);
    console.log(`\nScript Generated and Saved. Phases count: ${script.phases.length}`);

    // Retrieve phases
    const dbPhases = ScriptRepository.findPhasesByProjectId(projectId);

    // 4 & 5. Generate Scenes and Veo Prompts
    for (const phase of dbPhases) {
      const pNum = phase.phase_number;
      console.log(`\n--- 4. Generating Scenes for Phase ${pNum} ---`);
      
      const phaseItem = {
        phase_number: pNum,
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

      const sceneData = await sceneAgent.run(
        phaseItem,
        bible,
        projectId,
        pNum,
        0,
        undefined as any,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => {}
      );

      SceneRepository.createOrUpdateBatch(projectId, phase.id, pNum, sceneData.scenes);
      console.log(`Scenes generated for Phase ${pNum}: ${sceneData.scenes.length} scenes.`);

      console.log(`--- 5. Generating Veo Prompts for Phase ${pNum} ---`);
      const scenesInDb = SceneRepository.findByPhase(projectId, pNum);
      const bibleData = bible;
      
      for (const sceneRow of scenesInDb) {
        const scene = JSON.parse(sceneRow.raw_json);
        
        let locationDescription = scene.location_id;
        const loc = bibleData.location_roster.find((l: any) => l.id === scene.location_id);
        if (loc) {
          locationDescription = `Name: ${loc.name}, Type: ${loc.type}, Atmosphere: ${loc.atmosphere}, Lighting Notes: ${loc.lighting_notes}, Default Time: ${loc.time_of_day_default}, Visual Signature: ${loc.visual_signature}`;
        }

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
          objects_featured: objectsFeatured,
          raw_json: sceneRow.raw_json
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
          (chunk) => {},
          undefined,
          undefined
        );

        promptData.bible_version = bibleData.version || 1;
        VeoPromptRepository.createOrUpdate(
          projectId,
          sceneRow.id,
          sceneRow.phase_number,
          sceneRow.scene_number,
          promptData
        );
      }
      console.log(`Veo Prompts generated for Phase ${pNum}.`);
    }

    console.log('\n=== REGENERATION COMPLETE AND WRITTEN TO DB ===');

  } catch (err: any) {
    console.error('Error during regeneration:', err);
  } finally {
    db.close();
  }
}

main().catch(console.error);
