import db from '../db/connection';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { sceneAgent } from '../agents/scene-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';

async function testHindiAndEnglish() {
  console.log('=== RUNNING SCENE GENERATION TEST ===\n');

  const settings = SettingsRepository.getSettings();

  // ─── HINDI PROJECT ───
  const hindiProjectId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  console.log(`Running Hindi Project: ${hindiProjectId}`);
  
  let hindiBible = BibleRepository.findByProjectId(hindiProjectId);
  if (!hindiBible) {
    console.log('Bible not found. Generating Production Bible first...');
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(hindiProjectId) as any;
    const bibleData = await productionBibleAgent.run(
      project.topic,
      project.visual_style,
      project.narration_language,
      project.aspect_ratio,
      hindiProjectId,
      undefined,
      'gemini-2.5-flash'
    );
    // Save generated bible to DB
    BibleRepository.createOrUpdate(hindiProjectId, bibleData);
    hindiBible = BibleRepository.findByProjectId(hindiProjectId);
  }
  if (!hindiBible) throw new Error('Failed to load or generate Hindi Bible');
  const hindiBibleData = JSON.parse(hindiBible.raw_json);

  const hindiPhase = ScriptRepository.findPhaseByNumber(hindiProjectId, 1);
  if (!hindiPhase) throw new Error('Hindi Phase 1 not found');

  const hindiPhaseItem = {
    phase_number: hindiPhase.phase_number,
    phase_type: hindiPhase.phase_type as any,
    phase_title: hindiPhase.phase_title,
    phase_content: hindiPhase.phase_content,
    narration_text: hindiPhase.narration_text ?? '',
    narration_word_count: hindiPhase.narration_word_count ?? 0,
    key_events: [],
    character_ids_active: [],
    location_id_primary: '',
    estimated_duration_seconds: 0,
    viral_hook_rating: 0,
  };

  console.log('Original Phase 1 Hindi Narration:');
  console.log(hindiPhaseItem.narration_text);

  // Clear existing scenes for Phase 1 of this project
  db.prepare('DELETE FROM scenes WHERE project_id = ? AND phase_number = 1').run(hindiProjectId);
  db.prepare("UPDATE phases SET scenes_generated = 0 WHERE project_id = ? AND phase_number = 1").run(hindiProjectId);

  console.log('\nGenerating Hindi Scenes via SceneAgent...');
  const hindiResult = await sceneAgent.run(
    hindiPhaseItem,
    hindiBibleData,
    hindiProjectId,
    1,
    0,
    undefined,
    undefined,
    { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
    (chunk) => process.stdout.write(chunk),
    null
  );

  console.log('\n\n=== GENERATED HINDI SCENES ===');
  hindiResult.scenes.forEach((scene: any) => {
    console.log(`\nScene ${scene.scene_number} - Title: "${scene.title}"`);
    console.log(`Visual Description: ${scene.scene_description}`);
    console.log(`Voiceover: "${scene.narration_fragment}"`);
  });

  // ─── ENGLISH PROJECT ───
  const englishProjectId = '92a3e473-9900-4dd3-b23e-d31a486b5e0c';
  console.log(`\n\nRunning English Project: ${englishProjectId}`);

  const englishBible = BibleRepository.findByProjectId(englishProjectId);
  if (!englishBible) throw new Error('English Bible not found');
  const englishBibleData = JSON.parse(englishBible.raw_json);

  const englishPhase = ScriptRepository.findPhaseByNumber(englishProjectId, 1);
  if (!englishPhase) throw new Error('English Phase 1 not found');

  const englishPhaseItem = {
    phase_number: englishPhase.phase_number,
    phase_type: englishPhase.phase_type as any,
    phase_title: englishPhase.phase_title,
    phase_content: englishPhase.phase_content,
    narration_text: englishPhase.narration_text ?? '',
    narration_word_count: englishPhase.narration_word_count ?? 0,
    key_events: [],
    character_ids_active: [],
    location_id_primary: '',
    estimated_duration_seconds: 0,
    viral_hook_rating: 0,
  };

  console.log('Original Phase 1 English Narration:');
  console.log(englishPhaseItem.narration_text);

  // Clear existing scenes for Phase 1
  db.prepare('DELETE FROM scenes WHERE project_id = ? AND phase_number = 1').run(englishProjectId);
  db.prepare("UPDATE phases SET scenes_generated = 0 WHERE project_id = ? AND phase_number = 1").run(englishProjectId);

  console.log('\nGenerating English Scenes via SceneAgent...');
  const englishResult = await sceneAgent.run(
    englishPhaseItem,
    englishBibleData,
    englishProjectId,
    1,
    0,
    undefined,
    undefined,
    { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
    (chunk) => process.stdout.write(chunk),
    null
  );

  console.log('\n\n=== GENERATED ENGLISH SCENES ===');
  englishResult.scenes.forEach((scene: any) => {
    console.log(`\nScene ${scene.scene_number} - Title: "${scene.title}"`);
    console.log(`Visual Description: ${scene.scene_description}`);
    console.log(`Voiceover: "${scene.narration_fragment}"`);
  });
}

testHindiAndEnglish().catch(console.error);
