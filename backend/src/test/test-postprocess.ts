import db from '../db/connection';
import { veoAgent } from '../agents/veo-agent';

async function main() {
  const projectId = '645be835-1b5e-4026-9cb8-8312af2477c3';
  const bible = db.prepare('SELECT raw_json FROM production_bibles WHERE project_id = ?').get(projectId) as { raw_json: string };
  const bibleData = JSON.parse(bible.raw_json);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

  // Scene 6 (Prompt 72)
  const sceneRow6 = db.prepare('SELECT scene_number, title, scene_description, narration_fragment, raw_json FROM scenes WHERE project_id = ? AND phase_number = 7 AND scene_number = 6').get(projectId) as { raw_json: string };
  const parsedScene6 = JSON.parse(sceneRow6.raw_json);

  let locationDescription6 = parsedScene6.location_id;
  const loc6 = bibleData.location_roster.find((l: any) => l.id === parsedScene6.location_id);
  if (loc6) {
    locationDescription6 = `Name: ${loc6.name}, Type: ${loc6.type}, Atmosphere: ${loc6.atmosphere}, Lighting Notes: ${loc6.lighting_notes}, Default Time: ${loc6.time_of_day_default}, Visual Signature: ${loc6.visual_signature}`;
  }

  const resolvedScene6 = {
    title: parsedScene6.title,
    scene_number: parsedScene6.scene_number,
    phase_number: 7,
    narration_fragment: parsedScene6.narration_fragment,
    emotional_beat: parsedScene6.emotional_beat,
    scene_description: parsedScene6.scene_description,
    continuity_notes: parsedScene6.continuity_notes,
    transition_to_next: parsedScene6.transition_to_next,
    location_description: locationDescription6,
    characters_present: [],
    objects_featured: []
  };

  const data6 = {
    visual: "A slightly wider view of the crane cabin at night, revealing the operator's torso and hands moving with practiced ease across a detailed control panel.",
    shot: "medium",
    lens: "35mm ARRI Signature Prime lens",
    lighting: "original lighting",
    camera: "Pan right",
    duration_seconds: 8,
    ambient_sound: "hum",
    sfx: "click",
    avoid: "text, captions, labels, arrows, watermark, logo, unrealistic/toy-like scale, cartoon render, flickering geometry, digital artifacts",
    connection: "Cut to next",
    narration: "यह काम उच्च स्तर के कौशल और एकाग्रता की मांग करता है।"
  };

  const result6 = await (veoAgent as any).postProcess(
    data6,
    resolvedScene6,
    project,
    projectId,
    {},
    [],
    bibleData,
    'gemini-2.5-flash',
    null,
    false,
    parsedScene6.location_id,
    undefined,
    false
  );

  console.log('\n--- Scene 6 (Prompt 72) Result ---');
  console.log('Visual:', result6.visual);
  console.log('Lighting:', result6.lighting);
  console.log('Avoid:', result6.avoid);

  // Scene 3 (Prompt 69) - Testing "robotic arms" exclusion
  const sceneRow3 = db.prepare('SELECT scene_number, title, scene_description, narration_fragment, raw_json FROM scenes WHERE project_id = ? AND phase_number = 7 AND scene_number = 3').get(projectId) as { raw_json: string };
  const parsedScene3 = JSON.parse(sceneRow3.raw_json);

  let locationDescription3 = parsedScene3.location_id;
  const loc3 = bibleData.location_roster.find((l: any) => l.id === parsedScene3.location_id);
  if (loc3) {
    locationDescription3 = `Name: ${loc3.name}, Type: ${loc3.type}, Atmosphere: ${loc3.atmosphere}, Lighting Notes: ${loc3.lighting_notes}, Default Time: ${loc3.time_of_day_default}, Visual Signature: ${loc3.visual_signature}`;
  }

  const resolvedScene3 = {
    title: parsedScene3.title,
    scene_number: parsedScene3.scene_number,
    phase_number: 7,
    narration_fragment: parsedScene3.narration_fragment,
    emotional_beat: parsedScene3.emotional_beat,
    scene_description: "A crane lowers a container using robotic arms.",
    continuity_notes: parsedScene3.continuity_notes,
    transition_to_next: parsedScene3.transition_to_next,
    location_description: locationDescription3,
    characters_present: [],
    objects_featured: []
  };

  const data3 = {
    visual: "A crane lowers a container using robotic arms.",
    shot: "medium",
    lens: "50mm prime lens",
    lighting: "original lighting",
    camera: "Slow push in",
    duration_seconds: 8,
    ambient_sound: "hum",
    sfx: "clang",
    avoid: "text, captions, labels, arrows, watermark, logo, unrealistic/toy-like scale, cartoon render, flickering geometry, digital artifacts",
    connection: "Cut to next",
    narration: "ये क्रेनें इतनी सटीक होती हैं..."
  };

  const result3 = await (veoAgent as any).postProcess(
    data3,
    resolvedScene3,
    project,
    projectId,
    {},
    [],
    bibleData,
    'gemini-2.5-flash',
    null,
    false,
    parsedScene3.location_id,
    undefined,
    false
  );

  console.log('\n--- Scene 3 (Prompt 69) with Robotic Arms Result ---');
  console.log('Visual:', result3.visual);
  console.log('Lighting:', result3.lighting);
  console.log('Avoid:', result3.avoid);

  db.close();
}

main().catch(console.error);
