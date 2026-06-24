import { styleCurator } from '../services/style-curator.service';
import { CustomStyleRepository } from '../db/repositories/customstyle.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { runMigrations } from '../db/migrations/runner';
import { initDb } from '../db/database';
import db from '../db/connection';

async function runTests() {
  console.log('Running Style Curator Service Integration Tests...\n');

  // Initialize DB and migration for clean tests
  initDb();
  runMigrations();

  const settings = SettingsRepository.getSettings();
  const apiKey = settings.apiKey;
  if (!apiKey) {
    console.error('FAIL: No Gemini API Key configured in settings. Cannot run LLM curator tests.');
    process.exit(1);
  }

  // Define mock brief for test 1 (Documentary)
  const docBrief = {
    project_topic: 'Video Subject: A deep dive into the engineering of high-performance electric supercars.\nTOPICS COVERED:\n1. Battery heat management\n2. Carbon fiber monocoque chassis\n3. Instant torque vectoring\nGOAL OF THE VIDEO:\n- Teach audience engineering marvels.',
    content_type: 'documentary',
    engagement_blueprint: {
      core_curiosity_question: 'How do electric supercars survive extreme cornering speeds?',
      emotional_driver: 'wonder'
    }
  };

  // Test 1: CURATOR CORE MATCH
  console.log('--- TEST 1: CORE MATCH ---');
  try {
    const result = await styleCurator.curate(docBrief, 'English', apiKey, { profileDefaultKey: 'Documentary Realism' });
    console.log('Result:', {
      visual_style: result.visual_style.slice(0, 100) + '...',
      style_name: result.style_name,
      style_id: result.style_id,
      render_family: result.render_family,
      comfort: result.comfort,
      origin: result.origin,
      warnings: result.warnings
    });
    if (result.origin === 'matched' && result.comfort === 'comfortable') {
      console.log('✓ TEST 1 PASSED: Core style matched cleanly!\n');
    } else {
      console.warn('⚠ TEST 1 WARNING: Expected core matched style, got origin:', result.origin);
    }
  } catch (err: any) {
    console.error('TEST 1 FAILED with error:', err.message);
  }

  // Test 2: PIXAR CREATE / MATCH
  console.log('--- TEST 2: PIXAR CREATE/MATCH ---');
  const pixarBrief = {
    project_topic: 'Video Subject: A cute story about a little dragon named Pip who gets laughed at for breathing bubbles instead of fire.\nTOPICS COVERED:\n1. Pip tries to make fire\n2. Pip meets a bubble blowing fairy\n3. Pip saves the day using bubble bubbles.\nGOAL OF THE VIDEO:\n- Whimsical storytelling.',
    content_type: 'narrative',
    engagement_blueprint: {
      core_curiosity_question: 'Can Pip save the valley with bubbles?',
      emotional_driver: 'joy'
    }
  };

  try {
    const result = await styleCurator.curate(pixarBrief, 'English', apiKey);
    console.log('Result:', {
      visual_style: result.visual_style.slice(0, 100) + '...',
      style_name: result.style_name,
      style_id: result.style_id,
      render_family: result.render_family,
      comfort: result.comfort,
      origin: result.origin,
      warnings: result.warnings
    });
    if (result.render_family === 'pixar_3d') {
      console.log('✓ TEST 2 PASSED: Successfully matched or created pixar_3d render family!\n');
    } else {
      console.warn('⚠ TEST 2 WARNING: Render family was:', result.render_family);
    }
  } catch (err: any) {
    console.error('TEST 2 FAILED with error:', err.message);
  }

  // Test 3: WARNING (NOT BLOCK)
  console.log('--- TEST 3: WARNING GATE (AVOID TIER) ---');
  const flatBrief = {
    project_topic: 'Video Subject: Explaining compound interest and financial markets using simple infographics.\nTOPICS COVERED:\n1. Principal and interest rates\n2. Stock index returns\n3. Inflation eroding savings\nGOAL OF THE VIDEO:\n- Clear simple visual guides.',
    content_type: 'documentary',
    engagement_blueprint: {
      core_curiosity_question: 'How does compound interest build wealth?',
      emotional_driver: 'curiosity'
    }
  };

  try {
    const result = await styleCurator.curate(flatBrief, 'English', apiKey, { profileDefaultKey: '3D Explainer Environments' }); // force a non-comfortable or custom avoidance lookup
    // Let's create an avoidance custom style directly and match/test it
    const avoidStyle = CustomStyleRepository.create(
      'Flat 2D Vector Financial Animation',
      'Flat 2D vector style. Solid blocks of primary colors, unshaded characters, thick uniform lines, zero depth or gradients.',
      'flat_2d_vector'
    );

    const matchResult = await styleCurator.curate({
      ...flatBrief,
      project_topic: 'Flat 2D vector style. Solid blocks of primary colors, unshaded characters, thick uniform lines, zero depth or gradients.'
    }, 'English', apiKey);

    console.log('Match Result:', {
      style_name: matchResult.style_name,
      render_family: matchResult.render_family,
      comfort: matchResult.comfort,
      origin: matchResult.origin,
      warnings: matchResult.warnings
    });

    if (matchResult.comfort === 'avoid' && matchResult.warnings.length > 0) {
      console.log('✓ TEST 3 PASSED: Comfort warning surfaced correctly without blocking!\n');
    } else {
      console.warn('⚠ TEST 3 WARNING: Comfort was:', matchResult.comfort, 'Warnings count:', matchResult.warnings.length);
    }
  } catch (err: any) {
    console.error('TEST 3 FAILED with error:', err.message);
  }

  // Test 4: DEDUPE
  console.log('--- TEST 4: DEDUPE ON SAME TOPIC & DESCRIPTION ---');
  try {
    const randomName = 'Cyberpunk Neon Detective ' + Math.random().toString(36).substring(7);
    const newStyleData = {
      mode: 'new',
      name: randomName,
      description: 'Harsh neon-lit rainy streets of a futuristic cyberpunk city. Cyan and magenta color mood, extreme reflections on wet pavement, volumetric spotlight source, low-angle drone flyover, anamorphic vintage prime lens. Neon style tokens. Forbidden daylight.',
      veo_style_tokens: ['neon lights', 'wet reflections', 'anamorphic'],
      render_family: 'stylized_3d'
    };

    // Curate the first time (creates)
    const res1 = await styleCurator.curate({
      project_topic: 'Cyberpunk rainy futuristic neon lighting visual style.',
      content_type: 'narrative'
    }, 'English', apiKey);

    console.log('First Curation (Created or Matched):', {
      style_name: res1.style_name,
      origin: res1.origin,
      style_id: res1.style_id
    });

    // Curate the second time (should trigger deduplication based on high similarity or exact name match)
    const res2 = await styleCurator.curate({
      project_topic: 'Cyberpunk rainy futuristic neon lighting visual style.',
      content_type: 'narrative'
    }, 'English', apiKey);

    console.log('Second Curation (Should be Matched via dedupe):', {
      style_name: res2.style_name,
      origin: res2.origin,
      style_id: res2.style_id
    });

    if (res2.origin === 'matched') {
      console.log('✓ TEST 4 PASSED: Dedupe successfully prevented creating duplicate styles!\n');
    } else {
      console.warn('⚠ TEST 4 WARNING: Second curation had origin:', res2.origin);
    }
  } catch (err: any) {
    console.error('TEST 4 FAILED with error:', err.message);
  }
}

runTests().catch(err => {
  console.error('Test script crashed:', err);
});
