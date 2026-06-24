import { productionBibleAgent } from '../agents/production-bible-agent';
import { scriptAgent } from '../agents/script-agent';
import { veoAgent } from '../agents/veo-agent';
import { validatePrompt } from '../utils/veo-validation';
import { LLMRouter } from '../services/llm-router';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import logger from '../utils/logger';

async function main() {
  console.log('=== HINDI GENERATION END-TO-END TEST ===\n');

  // 1. Initialize database schema
  try {
    runMigrations();
  } catch (e) {
    // Ignored if migrations already ran
  }

  const projectId = 'test-hindi-project';

  // Clean up project from database if it exists
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM veo_prompts WHERE project_id = ?').run(projectId);

  // Create the Hindi narration project in the DB
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, 'Test Hindi Project', 'Secrets of the Ancient Temple', 'planning', 'Cinematic', 'Hindi', '16:9')
  `).run(projectId);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  console.log(`Created test project: "${project.title}" (Narration Language: ${project.narration_language})\n`);

  // 2. Intercept LLMRouter.generateStream to log prompts and return realistic mock responses
  const originalGenerateStream = LLMRouter.generateStream;

  let bibleSystemPromptCaptured = '';
  let bibleUserPromptCaptured = '';
  let scriptSystemPromptCaptured = '';
  let scriptUserPromptCaptured = '';

  LLMRouter.generateStream = async (agentName, prompt, onChunk, onProgress, onError, options, sanitizedPrompt) => {
    // Capture prompts for audit
    if (agentName === 'ProductionBibleAgent') {
      bibleUserPromptCaptured = prompt;
    } else if (agentName === 'ScriptAgent') {
      scriptUserPromptCaptured = prompt;
    }

    // Define Mock Responses
    if (agentName === 'ProductionBibleAgent') {
      const mockBible = {
        character_roster: [
          {
            id: 'CHAR_001',
            name: 'Arjun',
            role: 'Archaeologist',
            is_narrator: false,
            physical_description: 'A tall man in his late 30s with sun-bronzed skin and dark hair.',
            costume_description: 'Khaki safari shirt, brown leather boots, rugged trousers.',
            voice_tone: 'confident and warm',
            significance: 'major',
            dna: {
              facial_features: 'sharp jawline, dark brown eyes, slight stubble',
              clothing: 'Khaki safari vest and dark pants',
              age: '38',
              hairstyle: 'short, messy dark hair',
              body_type: 'athletic, tall stature',
              consistency_notes: 'Always wears the archaeologist leather strap'
            },
            appearance_lock: {
              character_type: 'human',
              physical_description: 'A tall man in his late 30s with sun-bronzed skin and dark hair.',
              style_notes: 'Photorealistic live-action cinematic look, natural shadows.',
              ethnicity: 'South Asian',
              approximate_age: '38',
              gender: 'male',
              skin_tone: 'sun-bronzed',
              hair: 'messy short dark hair',
              eyes: 'dark brown',
              face_structure: 'sharp and defined',
              distinguishing_features: 'slight stubble',
              primary_clothing: 'Khaki safari shirt and pants',
              clothing_colors: ['khaki', 'brown'],
              clothing_era: 'modern',
              accessories: 'leather wristband',
              forbidden_appearance_changes: ['Do not change vest color', 'Do not add glasses']
            }
          },
          {
            id: 'CHAR_002',
            name: 'The Narrator',
            role: 'Presenter',
            is_narrator: true,
            physical_description: 'A graceful speaker with expressive hands.',
            costume_description: 'Modern black coat and grey shirt.',
            voice_tone: 'mysterious and dramatic',
            significance: 'narrator',
            dna: {
              facial_features: 'expressive eyes, oval face',
              clothing: 'Black coat',
              age: '40',
              hairstyle: 'neatly combed black hair',
              body_type: 'slim',
              consistency_notes: 'Keeps eyes locked on the camera'
            },
            appearance_lock: {
              character_type: 'human',
              physical_description: 'A graceful speaker with expressive hands.',
              style_notes: 'Photorealistic live-action cinematic look.',
              ethnicity: 'Asian',
              approximate_age: '40',
              gender: 'female',
              skin_tone: 'light brown',
              hair: 'neat black hair',
              eyes: 'black',
              face_structure: 'oval',
              distinguishing_features: 'none',
              primary_clothing: 'Black coat',
              clothing_colors: ['black', 'grey'],
              clothing_era: 'modern',
              accessories: 'silver necklace',
              forbidden_appearance_changes: []
            }
          }
        ],
        location_roster: [
          {
            id: 'LOC_001',
            name: 'Ancient Temple Chamber',
            type: 'interior',
            atmosphere: 'mysterious and dusty',
            lighting_notes: 'shafts of golden sunlight cutting through the dust, dramatic shadows',
            time_of_day_default: 'afternoon',
            visual_signature: 'giant stone carvings and columns'
          }
        ],
        object_registry: Array.from({ length: 20 }, (_, i) => ({
          id: `OBJ_${String(i + 1).padStart(3, '0')}`,
          name: i === 0 ? 'Golden Amulet' : `Temple Artifact ${i + 1}`,
          description: i === 0 ? 'A circular solid gold disk engraved with sun patterns.' : `An ancient object found in temple chamber ${i + 1}`,
          symbolic_meaning: i === 0 ? 'key to the vault' : 'decoration',
          screen_time: 'often',
          is_hero_prop: i === 0,
          visual_lock: i === 0 ? 'Circular gold coin-like amulet, detailed star pattern in the center, dusty aged brass finish.' : `Artifact ${i + 1} description`,
          forbidden_variations: i === 0 ? ['Do not change gold material', 'Star pattern must be centered'] : []
        })),
        visual_style_lock: {
          color_palette: ['#8B5A2B', '#FFD700', '#2E8B57'],
          color_mood: 'warm volumetric gold',
          film_grain: true,
          aspect_ratio: '16:9',
          camera_movement_style: 'slow tracks and dramatic whip pans',
          lighting_style: 'high-contrast chiaroscuro, volumetric sunbeams',
          forbidden_elements: ['felt textures', 'claymation', 'smartphone screens', 'modern logos'],
          veo_style_tokens: ['35mm anamorphic prime', 'Kodak Vision3 500T', 'volumetric light'],
          render_style: 'photorealistic live-action cinematic',
          film_stock_grade: 'Kodak Vision3 5219',
          lens_family: 'Panavision Anamorphic Primes',
          time_of_day_lighting: {
            morning: {
              color_temperature_kelvin: 'three-thousand-two-hundred Kelvin',
              sun_position: 'low angle sun casting long soft shadows',
              shadow_quality: 'soft warm shadows',
              ambient_palette: ['#FFB6C1', '#F0E68C'],
              mood: 'peaceful morning golden hour'
            },
            afternoon: {
              color_temperature_kelvin: 'four-thousand-five-hundred Kelvin',
              sun_position: 'low angle sun casting long shadows',
              shadow_quality: 'soft-edged dark shadows',
              ambient_palette: ['#C8A2C8', '#FFF8DC'],
              mood: 'evocative and golden'
            },
            evening: {
              color_temperature_kelvin: 'three-thousand Kelvin',
              sun_position: 'sunset setting sun',
              shadow_quality: 'deep red and orange shadows',
              ambient_palette: ['#FF4500', '#8B0082'],
              mood: 'melancholic sunset glow'
            },
            night: {
              color_temperature_kelvin: 'five-thousand Kelvin',
              sun_position: 'no sun, moon overhead',
              shadow_quality: 'sharp cold blue shadows',
              ambient_palette: ['#000080', '#000000'],
              mood: 'dark eerie moonlit shadows'
            }
          }
        },
        meta: {
          topic: 'Secrets of the Ancient Temple',
          genre: 'archaeological mystery',
          tone: 'mysterious',
          target_duration_minutes: 5,
          language: 'Hindi',
          aspect_ratio: '16:9'
        }
      };
      onChunk(JSON.stringify(mockBible));
      return { billing_source: 'ai_studio' };
    }

    if (agentName === 'VeoAgent_AppearanceValidator') {
      onChunk(JSON.stringify({ violation: false, violations: [] }));
      return { billing_source: 'ai_studio' };
    }

    // Mock return value fallback
    onChunk('{}');
    return { billing_source: 'ai_studio' };
  };

  // 3. RUN BIBLE GENERATION
  console.log('--- Running Production Bible Generation ---');
  const bible = await productionBibleAgent.run(
    project.topic,
    project.visual_style,
    project.narration_language,
    project.aspect_ratio,
    projectId,
    undefined,
    'gemini-2.5-flash'
  );

  console.log('Production Bible Generated successfully.\n');

  console.log('--- (a) SAMPLE CHARACTER ROSTER ENTRY (Strictly English) ---');
  console.log(JSON.stringify(bible.character_roster[0], null, 2));
  console.log('\n--- (b) COMPILED LIGHTING KELVIN FIELD (Strictly English Words + Kelvin) ---');
  const kelvinField = (bible.visual_style_lock as any).time_of_day_lighting.afternoon.color_temperature_kelvin;
  console.log(`color_temperature_kelvin: "${kelvinField}"`);
  console.log(`ambient_palette: ${JSON.stringify((bible.visual_style_lock as any).time_of_day_lighting.afternoon.ambient_palette)}`);
  console.log(`sun_position: "${(bible.visual_style_lock as any).time_of_day_lighting.afternoon.sun_position}"\n`);

  // 4. TEST VEO PROMPT AND VALIDATION (PART 5)
  console.log('--- (c) COMPILED VEO PROMPTS & VALIDATIONS ---');

  // Mock scene database entries to support veoAgent.postProcess
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);

  db.prepare(`
    INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content)
    VALUES ('phase-1', ?, 1, 'hook', 'Introduction', 'A path.')
  `).run(projectId);

  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
    VALUES ('scene-h1', ?, 'phase-1', 1, 1, 'Intro', 'Arjun finds amulet', 'None', 'इस प्राचीन गुफा के भीतर, एक गहरा रहस्य छुपा हुआ है।', '{"is_dialogue":false,"dialogue":"None.","object_ids_featured":["OBJ_001"],"visual_state_snapshot":{"time_of_day":"afternoon"}}')
  `).run(projectId);

  db.prepare(`
    INSERT INTO scenes (id, project_id, phase_id, phase_number, scene_number, title, scene_description, continuity_notes, narration_fragment, raw_json)
    VALUES ('scene-h2', ?, 'phase-1', 1, 2, 'Narrator Speaks', 'The Narrator stands in temple', 'None', 'क्या आप इस प्राचीन सत्य को जानने के लिए तैयार हैं?', '{"is_dialogue":true,"dialogue":"क्या आप तैयार हैं?","object_ids_featured":[],"visual_state_snapshot":{"time_of_day":"afternoon"}}')
  `).run(projectId);

  // Scene 1: B-roll with Arjun (Archaeologist) - Narration scene (Not Presenter Shot, is_dialogue: false)
  const rawVeoData1 = {
    visual: 'Arjun carefully picks up the circular gold amulet from the dusty stone altar.',
    shot: 'extreme close up of hands',
    shot_type: 'close_up',
    lens: '50mm macro anamorphic prime',
    lighting: 'volumetric sunbeam, four-thousand-five-hundred Kelvin, high-contrast shadows',
    camera: 'static',
    ambient_sound: 'mysterious temple hum',
    sfx: 'stone grinding sound',
    avoid: 'watermark, cartoon, modern technology',
    connection: 'cut',
    narration: 'इस प्राचीन गुफा के भीतर, एक गहरा रहस्य छुपा हुआ है।',
    duration_seconds: 8
  };

  // Scene 2: Dialogue scene with Narrator on camera (is_narrator: true, is_dialogue: true)
  const rawVeoData2 = {
    visual: 'The Narrator stands in the middle of the temple, looking directly into the camera lens with a mysterious smile.',
    shot: 'medium shot',
    shot_type: 'medium',
    lens: '35mm prime lens',
    lighting: 'soft afternoon light, four-thousand-five-hundred Kelvin, warm volumetric',
    camera: 'slow push in',
    ambient_sound: 'soft echo in temple',
    sfx: 'None',
    avoid: 'watermark, blur, low quality',
    connection: 'fade',
    narration: 'क्या आप इस प्राचीन सत्य को जानने के लिए तैयार हैं?',
    duration_seconds: 6
  };

  // Run post-processing for Scene 1 (B-roll narration)
  const processedScene1 = await (veoAgent as any).postProcess(
    rawVeoData1,
    { phase_number: 1, scene_number: 1, title: 'Intro', narration_fragment: 'इस प्राचीन गुफा के भीतर, एक गहरा रहस्य छुपा हुआ है।' },
    project,
    projectId,
    {},
    ['CHAR_001'], // Arjun active (not the narrator)
    bible,
    undefined,
    null,
    false,
    'LOC_001',
    undefined,
    true // Enable validators
  );

  // Run post-processing for Scene 2 (Narrator Speaks - on camera lip-sync)
  const processedScene2 = await (veoAgent as any).postProcess(
    rawVeoData2,
    { phase_number: 1, scene_number: 2, title: 'Narrator Speaks', narration_fragment: 'क्या आप इस प्राचीन सत्य को जानने के लिए तैयार हैं?' },
    project,
    projectId,
    {},
    ['CHAR_002'], // The Narrator active on camera (is_narrator: true)
    bible,
    undefined,
    null,
    false,
    'LOC_001',
    undefined,
    true // Enable validators
  );

  console.log('--- PROMPT 1: Scene 1 (B-roll, Narration in Hindi, Visuals in English) ---');
  console.log(processedScene1.veo_full_prompt);
  console.log('\n--- PROMPT 2: Scene 2 (Narrator speaking on camera, dialogue in Hindi, Visuals in English) ---');
  console.log(processedScene2.veo_full_prompt);

  // 5. TEST VALIDATOR FOR REGRESSIONS (Hindi narration/dialogue, English visual/technical fields)
  console.log('\n--- Testing Validation Guard on Valid Prompt ---');
  let loggedWarnings: string[] = [];
  const originalWarn = logger.warn;
  logger.warn = ((msg: string) => {
    loggedWarnings.push(msg);
  }) as any;

  try {
    validatePrompt(rawVeoData1 as any, bible as any, project, 1);
    const hasHindiWarnings = loggedWarnings.some(w => w.includes('Hindi') || w.includes('English') || w.includes('non-Latin'));
    if (hasHindiWarnings) {
      console.log('❌ Valid Prompt failed with warnings:', loggedWarnings);
    } else {
      console.log('✅ Valid Prompt passed successfully.');
    }
  } catch (e: any) {
    console.error('❌ Valid Prompt threw unexpected error:', e.message);
  }

  console.log('\n--- Testing Validation Guard on Regressed Prompt (Devanagari in visual field) ---');
  loggedWarnings = [];
  const regressedVeoData = {
    ...rawVeoData1,
    visual: 'Arjun picks up the amulet. गुफा बहुत पुरानी है।' // Hindi leakage in visual description
  };

  validatePrompt(regressedVeoData as any, bible as any, project, 1);
  const blockedByRule = loggedWarnings.some(w => w.includes('must be English') || w.includes('non-Latin'));
  if (blockedByRule) {
    console.log('✅ Regressed prompt successfully blocked with warnings:');
    loggedWarnings.forEach(w => console.log(`   - "${w}"`));
  } else {
    console.log('❌ Error: Regressed prompt was allowed to pass silently! Logged warnings:', loggedWarnings);
  }

  // Restore logger
  logger.warn = originalWarn;

  // Clean up project from database when done
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
  db.close();

  console.log('\n=== TEST RUN COMPLETED ===');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
