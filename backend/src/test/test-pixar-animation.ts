import { productionBibleAgent } from '../agents/production-bible-agent';
import { veoAgent } from '../agents/veo-agent';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function main() {
  console.log('=== PIXAR 3D ANIMATION AND CREATURE TEST ===\n');

  const projectId = 'test-pixar-project-' + crypto.randomUUID().slice(0, 8);
  const title = 'The Dragon Everyone Laughed At';
  const visualStyle = 'Pixar 3D animation';
  const language = 'English';
  const aspectRatio = '16:9';

  // 1. Create the project in the DB
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, ?, ?, 'planning', ?, ?, ?)
  `).run(projectId, title, 'A story about a tiny dragon named Flick who cannot fly and gets laughed at, but eventually saves the forest.', visualStyle, language, aspectRatio);

  const project = ProjectRepository.findById(projectId);
  if (!project) throw new Error('Failed to create project');
  console.log(`Created project: "${project.title}"`);

  // 2. Define a Mock Story Plan containing Flick the Dragon
  const mockStoryPlan = {
    video_type: 'narrative',
    story_outline: 'Flick the tiny dragon wants to fly but his wings are too small. All the forest creatures laugh at him. When a forest fire breaks out, Flick uses his fire-breathing ability to trigger a waterfall and save everyone.',
    character_list: [
      {
        name: 'Flick',
        concept: 'A tiny blue dragon with oversized expressive eyes, stubby wings, and soft rubbery scales.'
      }
    ],
    location_list: [
      {
        name: 'Whispering Woods Forest',
        concept: 'A bright, colorful stylized forest with giant glowing mushrooms and soft mossy ground.'
      }
    ],
    object_list: [
      {
        name: 'Glowing Blue Flower',
        concept: 'A luminous magical flower Flick carries.'
      }
    ],
    estimated_runtime: '2 minutes',
    estimated_scene_count: 4,
    complexity_score: 50
  };

  // 3. Generate Production Bible
  console.log('\n--- Generating Production Bible ---');
  const bible = await productionBibleAgent.run(
    project.topic,
    project.visual_style,
    project.narration_language,
    project.aspect_ratio,
    projectId,
    undefined, // apiKey
    'gemini-2.5-flash',
    undefined,
    undefined,
    undefined,
    mockStoryPlan
  );

  console.log('Production Bible Generated successfully.\n');
  console.log('--- GENERATED OBJECT REGISTRY ---');
  console.log(`Count: ${bible.object_registry?.length || 0}`);
  console.log(JSON.stringify(bible.object_registry, null, 2));

  console.log('--- (a) EXTRACTED CHARACTER ROSTER ENTRY ---');
  const dragonChar = bible.character_roster.find((c: any) => c.name.toLowerCase().includes('flick')) || bible.character_roster[0];
  console.log(JSON.stringify(dragonChar, null, 2));

  console.log('\n--- (b) EXTRACTED VISUAL STYLE LOCK ---');
  console.log(JSON.stringify(bible.visual_style_lock, null, 2));

  // 4. Generate Veo Prompts
  console.log('\n--- Generating Veo Scene Prompts ---');

  // Insert mock script/phase/scene data to DB
  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content)
    VALUES ('phase-1', ?, 1, 'hook', 'The Tiny Dragon', 'Flick tries to fly but falls.')
  `).run(projectId);

  const mockSceneJson1 = {
    is_dialogue: false,
    dialogue: 'None.',
    object_ids_featured: ['OBJ_001'],
    visual_state_snapshot: {
      time_of_day: 'afternoon',
      characters_present: [
        {
          character_id: dragonChar.id,
          current_position: 'center ground',
          props_held: ['OBJ_001'],
          physical_condition: 'exhausted, sad',
          facing_direction: 'camera'
        }
      ]
    }
  };

  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
    VALUES ('scene-1', ?, 'phase-1', 1, 1, 'Flick Falls', 'Flick the tiny dragon flaps his stubby wings and falls on soft moss, while other forest creatures point and laugh.', 'None', 'Flick flapped his wings as hard as he could, but gravity had other plans.', ?)
  `).run(projectId, JSON.stringify(mockSceneJson1));

  const mockSceneJson2 = {
    is_dialogue: false,
    dialogue: 'None.',
    object_ids_featured: ['OBJ_001'],
    visual_state_snapshot: {
      time_of_day: 'afternoon',
      characters_present: [
        {
          character_id: dragonChar.id,
          current_position: 'center ground',
          props_held: ['OBJ_001'],
          physical_condition: 'determined',
          facing_direction: 'sky'
        }
      ]
    }
  };

  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
    VALUES ('scene-2', ?, 'phase-1', 1, 2, 'Flick Looks Up', 'Flick pushes himself up from the mossy ground, looks up at the towering trees and the sky with intense determination.', 'None', 'But he refused to give up, staring at the sky with fire in his eyes.', ?)
  `).run(projectId, JSON.stringify(mockSceneJson2));

  const sceneRow1 = db.prepare('SELECT * FROM scenes WHERE project_id = ? AND scene_number = 1').get(projectId) as any;
  const sceneRow2 = db.prepare('SELECT * FROM scenes WHERE project_id = ? AND scene_number = 2').get(projectId) as any;
  
  // Resolve scene fields (which usually happens in scenes routes/controller)
  const resolvedScene1 = {
    ...sceneRow1,
    ...JSON.parse(sceneRow1.raw_json),
    location_description: 'Whispering Woods Forest: A bright, colorful stylized forest with giant glowing mushrooms and soft mossy ground.',
    characters_present: [
      {
        character_id: dragonChar.id,
        name: dragonChar.name,
        role: dragonChar.role,
        physical_description: dragonChar.physical_description,
        costume_description: dragonChar.costume_description,
        appearance_lock: dragonChar.appearance_lock
      }
    ],
    objects_featured: [
      {
        id: 'OBJ_001',
        name: 'Glowing Blue Flower',
        description: 'A luminous magical flower Flick carries.'
      }
    ]
  };

  const resolvedScene2 = {
    ...sceneRow2,
    ...JSON.parse(sceneRow2.raw_json),
    location_description: 'Whispering Woods Forest: A bright, colorful stylized forest with giant glowing mushrooms and soft mossy ground.',
    characters_present: [
      {
        character_id: dragonChar.id,
        name: dragonChar.name,
        role: dragonChar.role,
        physical_description: dragonChar.physical_description,
        costume_description: dragonChar.costume_description,
        appearance_lock: dragonChar.appearance_lock
      }
    ],
    objects_featured: [
      {
        id: 'OBJ_001',
        name: 'Glowing Blue Flower',
        description: 'A luminous magical flower Flick carries.'
      }
    ]
  };

  const veoPrompt1 = await veoAgent.run(
    resolvedScene1,
    project,
    bible,
    projectId,
    1, // phaseNumber
    1, // sceneNumber
    undefined, // apiKey
    'gemini-2.5-flash',
    undefined
  );

  const veoPrompt2 = await veoAgent.run(
    resolvedScene2,
    project,
    bible,
    projectId,
    1, // phaseNumber
    2, // sceneNumber
    undefined, // apiKey
    'gemini-2.5-flash',
    undefined
  );

  console.log('\n=== COMPILED VEO PROMPT 1 ===');
  console.log(veoPrompt1.veo_full_prompt);

  console.log('\n=== COMPILED VEO PROMPT 2 ===');
  console.log(veoPrompt2.veo_full_prompt);

  // Clean up
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  console.log('\nDatabase cleaned up.');
}

main().catch(console.error);
