import { veoAgent, assembleVeoFullPrompt } from '../agents/veo-agent';
import db from '../db/connection';

console.log('Testing Presenter Shot compiling...');

// Setup a mock project, phase, and scene in the SQLite DB so postProcess can query it
db.prepare('DELETE FROM scenes WHERE project_id = ?').run('test-presenter-project');
db.prepare('DELETE FROM phases WHERE project_id = ?').run('test-presenter-project');
db.prepare('DELETE FROM projects WHERE id = ?').run('test-presenter-project');

db.prepare(`
  INSERT INTO projects (id, title, topic, status, visual_style)
  VALUES ('test-presenter-project', 'Test Presenter Project', 'Presenter test', 'script', 'Cinematic')
`).run();

db.prepare(`
  INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content)
  VALUES ('test-presenter-phase', 'test-presenter-project', 1, 'hook', 'Introduction', 'A path.')
`).run();

db.prepare(`
  INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
  VALUES ('scene-1', 'test-presenter-project', 'test-presenter-phase', 1, 1, 'Introduction', 'Sarah stands in front of the trees.', 'None', 'In the heart of the ancient forest, a forgotten path reveals itself.', '{"is_dialogue":false,"dialogue":"None."}')
`).run();

const mockBible = {
  character_roster: [
    {
      id: 'CHAR_001',
      name: 'Sarah',
      role: 'Presenter',
      is_narrator: true,
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
  ]
};

const mockProject = {
  title: 'Test Presenter Project'
};

async function test() {
  // Test Case 1: Narrator is on camera (activeCharacterIds contains CHAR_001)
  console.log('\n==================================================');
  console.log('TEST CASE 1: NARRATOR ON CAMERA');
  console.log('==================================================');
  const promptDataOnCamera = {
    visual: 'Sarah stands in front of the trees, looking at the camera.',
    shot: 'medium shot',
    shot_type: 'medium',
    lens: '35mm',
    lighting: 'natural daylight',
    camera: 'static',
    ambient_sound: 'wind rustling leaves',
    sfx: 'None',
    avoid: 'watermark',
    connection: 'cut',
    narration: 'In the heart of the ancient forest, a forgotten path reveals itself.',
    duration_seconds: 8
  };

  const processedOnCamera = await (veoAgent as any).postProcess(
    promptDataOnCamera,
    { phase_number: 1, scene_number: 1, title: 'Introduction', narration_fragment: 'In the heart of the ancient forest, a forgotten path reveals itself.' },
    mockProject,
    'test-presenter-project',
    {},
    ['CHAR_001'], // narrator active on camera
    mockBible,
    undefined,
    null,
    false,
    'LOC_001',
    undefined,
    false // disable validators
  );

  console.log('Processed Visual Field:\n"', processedOnCamera.visual, '"');
  console.log('\nAvoid Keywords:\n"', processedOnCamera.avoid, '"');
  console.log('\nDialogue Field:', processedOnCamera.dialogue);
  console.log('Is Dialogue Field:', processedOnCamera.is_dialogue);
  console.log('Spoken On Camera:', processedOnCamera.spoken_on_camera);
  console.log('Audio Source:', processedOnCamera.narration_audio_source);
  console.log('\nCompiled Veo Full Prompt:\n');
  console.log(processedOnCamera.veo_full_prompt);

  // Test Case 2: Narrator is off camera (silent B-roll VO)
  console.log('\n==================================================');
  console.log('TEST CASE 2: NARRATOR OFF CAMERA (SILENT VO OVER B-ROLL)');
  console.log('==================================================');
  const promptDataOffCamera = {
    visual: 'A narrow dusty path winding through towering pine trees.',
    shot: 'wide shot',
    shot_type: 'wide',
    lens: '35mm',
    lighting: 'natural daylight',
    camera: 'static',
    ambient_sound: 'wind rustling leaves',
    sfx: 'None',
    avoid: 'watermark',
    connection: 'cut',
    narration: 'In the heart of the ancient forest, a forgotten path reveals itself.',
    duration_seconds: 8
  };

  const processedOffCamera = await (veoAgent as any).postProcess(
    promptDataOffCamera,
    { phase_number: 1, scene_number: 1, title: 'Introduction', narration_fragment: 'In the heart of the ancient forest, a forgotten path reveals itself.' },
    mockProject,
    'test-presenter-project',
    {},
    [], // no narrator on camera
    mockBible,
    undefined,
    null,
    false,
    'LOC_001',
    undefined,
    false // disable validators
  );

  console.log('Processed Visual Field:\n"', processedOffCamera.visual, '"');
  console.log('\nAvoid Keywords:\n"', processedOffCamera.avoid, '"');
  console.log('\nDialogue Field:', processedOffCamera.dialogue);
  console.log('Is Dialogue Field:', processedOffCamera.is_dialogue);
  console.log('Spoken On Camera:', processedOffCamera.spoken_on_camera);
  console.log('Audio Source:', processedOffCamera.narration_audio_source);
  console.log('\nCompiled Veo Full Prompt:\n');
  console.log(processedOffCamera.veo_full_prompt);

  // Cleanup DB
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run('test-presenter-project');
  db.prepare('DELETE FROM phases WHERE project_id = ?').run('test-presenter-project');
  db.prepare('DELETE FROM projects WHERE id = ?').run('test-presenter-project');
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
