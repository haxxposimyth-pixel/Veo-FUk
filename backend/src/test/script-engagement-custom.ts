import { LLMRouter } from '../services/llm-router';
import { scriptAgent } from '../agents/script-agent';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import assert from 'assert';

console.log('Running ScriptAgent Engagement Psychology Integration Tests...');

// Initialize database schema
try {
  runMigrations();
} catch (e) {}

const projectId = 'test-engagement-project';

// Set up clean database state
db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);

db.prepare(`
  INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
  VALUES (?, 'Test Engagement Project', 'How paper money replaced metal coins', 'planning', 'Cinematic', 'English', '16:9')
`).run(projectId);

const mockBible = {
  character_roster: [
    {
      id: 'CHAR_001',
      name: 'Noah',
      role: 'Timekeeper',
      physical_description: 'An old man with a grey beard',
      costume_description: 'Tweed coat',
      voice_tone: 'gravelly',
      significance: 'major',
      appearance_lock: {
        ethnicity: 'caucasian',
        approximate_age: '70',
        gender: 'male',
        skin_tone: 'fair',
        hair: 'grey',
        eyes: 'brown',
        face_structure: 'wrinkled',
        distinguishing_features: 'none',
        primary_clothing: 'Tweed coat',
        clothing_colors: ['grey'],
        clothing_era: ' Victorian',
        accessories: 'none',
        forbidden_appearance_changes: []
      }
    }
  ],
  location_roster: [
    {
      id: 'LOC_001',
      name: 'Clock Workshop',
      type: 'interior',
      atmosphere: 'dusty',
      lighting_notes: 'warm',
      time_of_day_default: 'afternoon',
      visual_signature: 'gears'
    }
  ],
  object_registry: [
    {
      id: 'OBJ_001',
      name: 'Chronograph Watch',
      description: 'Engraved pocket watch',
      symbolic_meaning: 'time limit',
      screen_time: 'often'
    }
  ],
  visual_style_lock: {
    color_palette: ['#5C4033', '#C0C0C0'],
    color_mood: 'sepia',
    film_grain: true,
    aspect_ratio: '16:9',
    camera_movement_style: 'slow track',
    lighting_style: 'chiaroscuro',
    forbidden_elements: [],
    veo_style_tokens: []
  },
  meta: {
    topic: 'Paper Money replacement of coins',
    genre: 'historical mystery',
    tone: 'suspenseful',
    target_duration_minutes: 5,
    language: 'English',
    aspect_ratio: '16:9'
  }
};

const originalGenerateStream = LLMRouter.generateStream;

void (async () => {
  try {
    let callCount = 0;
    const promptsReceived: string[] = [];

    // Setup stub/mock for LLM router
    LLMRouter.generateStream = async (agentName, prompt, onChunk) => {
      promptsReceived.push(prompt);
      callCount++;

      // We parse the prompt to determine which phase is generated
      if (prompt.includes("resolve the optimal audience and engagement settings")) {
        // Resolve settings pre-step
        const resolvedSettings = {
          target_audience: 'gen_z',
          hook_regenerate: 'on',
          pre_climax_spike: 'on',
          long_open_loop: 'on',
          reasoning: 'Gen Z is perfect for high energy pacing, we need maximum engagement.'
        };
        onChunk(JSON.stringify(resolvedSettings));
        return { billing_source: 'ai_studio' };
      }

      // Extract the phase number requested
      const phaseMatch = prompt.match(/Generate Phase (\d+)/i) || prompt.match(/Rewrite Phase (\d+)/i) || prompt.match(/doctor\. Rewrite Phase (\d+)/i);
      const pNum = phaseMatch ? parseInt(phaseMatch[1], 10) : 1;

      // Map phase index to phase type
      const phaseTypes = [
        'hook',
        'build_up', 'build_up', 'build_up',
        'escalation', 'escalation', 'escalation', 'escalation',
        'climax',
        'outro'
      ];
      const pType = phaseTypes[pNum - 1] || 'build_up';

      // Simulate output response for each phase
      let responseObj: any = {
        phase_number: pNum,
        phase_type: pType,
        phase_title: `Phase ${pNum} Title`,
        phase_content: `Action for phase ${pNum} visual description.`,
        narration_text: `This is a very long narration text for phase ${pNum} that needs to exceed the minimum word count rule to successfully pass validation. Let us repeat it to make sure it has enough words to easily go past the 120 word minimum limit for phases 2 through 10. Word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word.`,
        narration_word_count: 130,
        estimated_duration_seconds: 30,
        viral_hook_rating: 7,
        rehook_type: null,
        open_loop_role: 'none',
        key_facts: [`Fact ${pNum}`],
        key_images: [`Image ${pNum}`],
        key_events: [`Event ${pNum}`],
        characters_mentioned: ['Noah']
      };

      if (pNum === 1) {
        // Simulating a weak hook on the first call to trigger regeneration
        if (callCount === 2) { // Call 1 is resolve, Call 2 is Phase 1 (first attempt)
          responseObj.viral_hook_rating = 5;
          responseObj.narration_text = "Weak hook narration containing some placeholder text that is long enough to pass sixty words. Let's make sure it is at least sixty words so the schema validation doesn't complain about word count requirements for phase 1.";
          responseObj.narration_word_count = 65;
        } else {
          // Call 3 is Phase 1 retry
          responseObj.viral_hook_rating = 9;
          responseObj.narration_text = "Cleopatra didn't seduce Rome's greatest generals. She dismantled them. She inherited a bankrupt kingdom surrounded by the most powerful military machine. How does a queen with no army force conquerors to kneel?";
          responseObj.narration_word_count = 65;
        }
      }

      if (pNum === 2) {
        // Plant loop in phase 2
        responseObj.open_loop_role = 'plant';
      }

      if (pNum === 8) {
        // Pre-climax spike
        responseObj.rehook_type = 'pre_climax_spike';
      }

      if (pNum === 9) {
        // Climax payoff - on first generation we mock it missing 'payoff'
        const isClimaxRegenCall = prompt.includes("CRITICAL: You are regenerating the Climax") || prompt.includes("resolve the mystery planted");
        if (isClimaxRegenCall) {
          responseObj.open_loop_role = 'payoff';
        } else {
          responseObj.open_loop_role = 'none';
        }
      }

      onChunk(JSON.stringify(responseObj));
      return { billing_source: 'ai_studio' };
    };

    console.log('\n--- Executing ScriptAgent.run with resolved auto settings ---');
    const result = await scriptAgent.run(
      'How paper money replaced metal coins',
      mockBible as any,
      projectId,
      undefined,
      'mock-model',
      { temperature: 0.1 },
      undefined,
      null,
      {
        pacing: 5,
        emotional_intensity: 5,
        narration_style: 5,
        target_audience: 'auto',
        hook_regenerate: 'auto',
        pre_climax_spike: 'auto',
        long_open_loop: 'auto'
      }
    );

    console.log('\n--- Result Verification ---');
    console.log('Resolved Audience:', result.target_audience);
    console.log('Resolved Hook Regen:', result.hook_regenerate);
    console.log('Resolved Pre-Climax Spike:', result.pre_climax_spike);
    console.log('Resolved Long Open Loop:', result.long_open_loop);
    
    assert.strictEqual(result.target_audience, 'gen_z');
    assert.strictEqual(result.hook_regenerate, 'on');
    assert.strictEqual(result.pre_climax_spike, 'on');
    assert.strictEqual(result.long_open_loop, 'on');

    const phase1 = result.phases.find(p => p.phase_number === 1);
    console.log('Phase 1 score:', phase1?.viral_hook_rating);
    assert.strictEqual(phase1?.viral_hook_rating, 9);

    const phase2 = result.phases.find(p => p.phase_number === 2);
    console.log('Phase 2 loop role:', phase2?.open_loop_role);
    assert.strictEqual(phase2?.open_loop_role, 'plant');

    const phase8 = result.phases.find(p => p.phase_number === 8);
    console.log('Phase 8 rehook type:', phase8?.rehook_type);
    assert.strictEqual(phase8?.rehook_type, 'pre_climax_spike');

    const phase9 = result.phases.find(p => p.phase_number === 9);
    console.log('Phase 9 loop role:', phase9?.open_loop_role);
    assert.strictEqual(phase9?.open_loop_role, 'payoff');

    console.log('\nAll integration tests passed successfully!');

  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    LLMRouter.generateStream = originalGenerateStream;
  }
})();
