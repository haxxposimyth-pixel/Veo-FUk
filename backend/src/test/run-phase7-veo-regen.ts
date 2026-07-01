process.env.DB_PATH = './data/viral-video-studio.db';
import db from '../db/connection';
import { veoAgent } from '../agents/veo-agent';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';

async function main() {
  const projectId = '645be835-1b5e-4026-9cb8-8312af2477c3';
  const phaseNumber = 7;

  console.log(`Loading project and bible for ID: ${projectId}`);
  const project = ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');

  const bible = BibleRepository.findByProjectId(projectId);
  if (!bible) throw new Error('Bible not found');
  const bibleData = JSON.parse(bible.raw_json);

  const settings = SettingsRepository.getSettings();
  console.log('Settings Model:', settings.model);

  const scenes = SceneRepository.findByPhase(projectId, phaseNumber);
  console.log(`Found ${scenes.length} scenes in Phase 7.`);

  for (const sceneRow of scenes) {
    const scene = JSON.parse(sceneRow.raw_json);

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

    console.log(`\nGenerating prompt for Scene ${sceneRow.scene_number}...`);
    const promptData = await veoAgent.run(
      resolvedScene,
      project,
      bibleData,
      projectId,
      sceneRow.phase_number,
      sceneRow.scene_number,
      settings.apiKey,
      settings.model,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
    );

    promptData.bible_version = bibleData.version || 1;

    await VeoPromptRepository.createOrUpdate(
      projectId,
      sceneRow.id,
      sceneRow.phase_number,
      sceneRow.scene_number,
      promptData
    );
  }

  console.log('\n=== REGENERATION COMPLETED ===\n');

  // Verify the generated prompts
  const prompts = db.prepare(`
    SELECT id, phase_number, scene_number, prompt_number, raw_json
    FROM veo_prompts
    WHERE project_id = ? AND CAST(prompt_number AS INTEGER) BETWEEN 68 AND 72
    ORDER BY CAST(prompt_number AS INTEGER) ASC
  `).all(projectId) as any[];

  for (const p of prompts) {
    const data = JSON.parse(p.raw_json);
    console.log(`Prompt ${p.prompt_number} (Phase ${p.phase_number}, Scene ${p.scene_number}):`);
    console.log(`- Visual: ${data.visual}`);
    console.log(`- Lighting: ${data.lighting}`);
    console.log(`- Avoid: ${data.avoid}`);
    console.log(`- Full prompt:`);
    console.log(data.veo_full_prompt);
    console.log('====================================================');
  }

  db.close();
}

main().catch(console.error);
