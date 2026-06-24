import { credibilityReviewerAgent } from '../agents/credibility-reviewer-agent';
import { storyAnalyzerAgent } from '../agents/story-analyzer-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import db from '../db/connection';
import crypto from 'crypto';

async function runTests() {
  console.log('=== TESTING CREDIBILITY REVIEWER CRITIC AGENT ===\n');

  // Configure settings
  const settings = SettingsRepository.getSettings();
  const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('ERROR: No Gemini API Key found in settings or environment. Please configure settings or set GEMINI_API_KEY.');
    process.exit(1);
  }

  console.log(`Using API Key: ${apiKey.substring(0, 8)}...`);
  console.log(`Using model: ${settings.model || 'gemini-2.5-pro'}`);

  // Test 1: DOCUMENTARY (Hindi)
  console.log('\n----------------------------------------');
  console.log('TEST 1: DOCUMENTARY FACT-CHECK (Hindi)');
  console.log('----------------------------------------');

  const docProjectId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  const docTopic = 'STING ENERGY DRINK - FACTORY DOCUMENTARY. The high-speed manufacturing process, chemical composition, caffeine/taurine blend, and how it is bottled at 1200 cans per minute.';
  
  // We insert some intentional factual, numerical, and sequence errors:
  // - Phase 1: 12 million cans per minute (instead of 1200)
  // - Phase 2: Mixed taurine after packaging (step out of order)
  // - Phase 3: Exaggerated claim (consumes it and runs at speed of light)
  // - Phase 4: Fahrenheit instead of Celsius (wrong unit/depth/distance)
  const docPhases = [
    {
      phase_number: 1,
      phase_title: 'Introduction to Sting Factory',
      narration_text: 'क्या आप जानते हैं कि हर एक मिनट में स्टिंग फैक्ट्री 12 मिलियन कैन तैयार करती है? यह दुनिया की सबसे तेज़ पैकेजिंग लाइन है।'
    },
    {
      phase_number: 2,
      phase_title: 'Chemical Mixing Process',
      narration_text: 'स्टिंग कैन को सील और पैक करने के बाद, हम इसमें टॉरिन और कैफीन का गुप्त मिश्रण मिलाते हैं।'
    },
    {
      phase_number: 3,
      phase_title: 'Sting Energy Boost',
      narration_text: 'इस ऊर्जा पेय का केवल एक घूंट आपको प्रकाश की गति से दौड़ा सकता है और आपको अनंत ऊर्जा देगा।'
    },
    {
      phase_number: 4,
      phase_title: 'Temperature Controls',
      narration_text: 'इस मिश्रण को बिल्कुल 85 डिग्री फारेनहाइट पर उबाला जाता है ताकि कैफीन पूरी तरह घुल जाए।'
    }
  ];

  console.log('Running credibility review on Hindi Documentary...');
  const docStart = Date.now();
  const docResult = await credibilityReviewerAgent.analyze(
    docProjectId,
    docPhases,
    {
      content_type: 'documentary',
      topic: docTopic,
      narration_language: 'Hindi'
    },
    undefined,
    'gemini-2.5-flash'
  );
  const docEnd = Date.now();
  console.log(`Documentary review completed in ${((docEnd - docStart) / 1000).toFixed(2)}s`);
  console.log(`Overall Credibility Score: ${docResult.overall_credibility_score}/10`);
  console.log(`Summary: ${docResult.summary}`);
  console.log('Issues found:');
  console.log(JSON.stringify(docResult.issues, null, 2));


  // Test 2: FICTION (English)
  console.log('\n----------------------------------------');
  console.log('TEST 2: FICTION INTEGRITY (English)');
  console.log('----------------------------------------');

  const ficProjectId = 'fiction-test-project-123';
  const ficTopic = 'The Dragon Who Couldn\'t Breathe Fire. A fantasy story about Ignis, a blue dragon who breathes ice instead of fire, traveling to find the fire spark.';

  // In fiction:
  // - Ignis breathing ice or flying at 1000 mph should NOT be flagged as errors (fiction rules apply).
  // - But an internal contradiction (Phase 1 says he is a blue dragon, Phase 3 says he has red scales) should be flagged.
  const ficPhases = [
    {
      phase_number: 1,
      phase_title: 'Ignis the Blue Dragon',
      narration_text: 'Deep in the Whispering Mountains lived Ignis. Unlike other dragons who were red, Ignis had beautiful, shining blue scales and could only breathe freezing ice.'
    },
    {
      phase_number: 2,
      phase_title: 'The Great Flight',
      narration_text: 'Ignis flapped his wings and took off, flying at 1000 miles per hour, crossing the ocean in just three minutes to find the fire spark.'
    },
    {
      phase_number: 3,
      phase_title: 'The Mirror of Truth',
      narration_text: 'Ignis looked into the magical lake. His brilliant crimson red scales reflected in the water, making him smile.'
    }
  ];

  // Ensure project exists in DB to prevent FOREIGN KEY constraint error in writeAgentLog
  db.prepare('DELETE FROM projects WHERE id = ?').run(ficProjectId);
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type)
    VALUES (?, ?, ?, 'setup', 'Fantasy', 'English', '16:9', 'fiction')
  `).run(ficProjectId, 'Fiction Test Project', ficTopic);

  console.log('Running credibility review on English Fiction...');
  const ficStart = Date.now();
  const ficResult = await credibilityReviewerAgent.analyze(
    ficProjectId,
    ficPhases,
    {
      content_type: 'fiction',
      topic: ficTopic,
      narration_language: 'English'
    },
    undefined,
    'gemini-2.5-flash'
  );
  const ficEnd = Date.now();
  console.log(`Fiction review completed in ${((ficEnd - ficStart) / 1000).toFixed(2)}s`);
  console.log(`Overall Credibility Score: ${ficResult.overall_credibility_score}/10`);
  console.log(`Summary: ${ficResult.summary}`);
  console.log('Issues found:');
  console.log(JSON.stringify(ficResult.issues, null, 2));


  // Test 3: PARALLEL EXECUTION
  console.log('\n----------------------------------------');
  console.log('TEST 3: PARALLEL RUN TIME COMPARISON');
  console.log('----------------------------------------');

  console.log('Running both critics in parallel (Promise.all)...');
  const parallelStart = Date.now();
  const [storyAnalysis, credibilityReview] = await Promise.all([
    storyAnalyzerAgent.analyze(
      docProjectId,
      docPhases,
      undefined,
      'gemini-2.5-flash'
    ),
    credibilityReviewerAgent.analyze(
      docProjectId,
      docPhases,
      {
        content_type: 'documentary',
        topic: docTopic,
        narration_language: 'Hindi'
      },
      undefined,
      'gemini-2.5-flash'
    )
  ]);
  const parallelEnd = Date.now();
  console.log(`Parallel run completed in ${((parallelEnd - parallelStart) / 1000).toFixed(2)}s`);
  console.log(`Story score: ${storyAnalysis.overall_retention_score}, Credibility score: ${credibilityReview.overall_credibility_score}`);

  // Clean up fiction test project
  db.prepare('DELETE FROM projects WHERE id = ?').run(ficProjectId);
  db.prepare('DELETE FROM credibility_reviews WHERE project_id = ?').run(ficProjectId);
  db.prepare('DELETE FROM agent_logs WHERE project_id = ?').run(ficProjectId);

  db.close();
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  db.close();
});
