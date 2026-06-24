import express from 'express';
import { LLMRouter } from '../services/llm-router';
import { ScriptRepository } from '../db/repositories/script.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { CredibilityReviewRepository } from '../db/repositories/credibility-review.repo';
import scriptRouter from '../routes/script.routes';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import assert from 'assert';

console.log('=== Running Credibility Fixes Verification Tests ===\n');

// Ensure database migrations are run
try {
  runMigrations();
} catch (e) {
  // Ignore or log
}

const projectId = 'test-cred-fixes-proj';
const phase1Id = 'test-cred-phase-1';
const phase2Id = 'test-cred-phase-2';

// 1. Clean Database State
db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM phases WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM scripts WHERE project_id = ?').run(projectId);
db.prepare('DELETE FROM credibility_reviews WHERE project_id = ?').run(projectId);

// 2. Insert Mock Project (Hindi narration)
db.prepare(`
  INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio, content_type, content_profile)
  VALUES (?, 'Fact-Checking Test Project', 'Sting Energy Drink Factory', 'script', 'Cinematic', 'Hindi', '16:9', 'documentary', 'viral_story')
`).run(projectId);

// 3. Insert Mock Bible
const mockBible = {
  character_roster: [],
  location_roster: [],
  object_registry: [],
  visual_style_lock: {
    style_name: 'Cinematic',
    forbidden_elements: [],
    veo_style_tokens: []
  },
  meta: {
    topic: 'Sting Energy Drink Factory',
    genre: 'documentary',
    tone: 'dramatic',
    target_duration_minutes: 8,
    language: 'Hindi',
    aspect_ratio: '16:9'
  }
};
db.prepare(`
  INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
  VALUES (?, ?, '[]', '[]', '[]', ?, ?, 1)
`).run('test-bible-fixes-id', projectId, JSON.stringify(mockBible.visual_style_lock), JSON.stringify(mockBible));

// 4. Insert Mock Script
const mockScript = {
  title: 'Sting Energy Drink Factory',
  total_estimated_duration_minutes: 2.5,
  phases: [
    {
      phase_number: 1,
      phase_type: 'hook',
      phase_title: 'Intro',
      narration_text: 'क्या आप जानते हैं कि हर एक मिनट में स्टिंग फैक्ट्री 12 मिलियन कैन तैयार करती है? यह दुनिया की सबसे तेज़ पैकेजिंग लाइन है।',
      narration_word_count: 22,
      key_events: [],
      character_ids_active: [],
      location_id_primary: 'LOC_001',
      estimated_duration_seconds: 15,
      viral_hook_rating: 8
    },
    {
      phase_number: 2,
      phase_type: 'build_up',
      phase_title: 'Process',
      narration_text: 'स्टिंग कैन को सील और पैक करने के बाद, हम इसमें टॉरिन और कैफीन का गुप्त मिश्रण मिलाते हैं।',
      narration_word_count: 17,
      key_events: [],
      character_ids_active: [],
      location_id_primary: 'LOC_001',
      estimated_duration_seconds: 15,
      viral_hook_rating: 8
    }
  ]
};
db.prepare(`
  INSERT INTO scripts (id, project_id, raw_json, approved, version)
  VALUES (?, ?, ?, 0, 1)
`).run('test-script-fixes-id', projectId, JSON.stringify(mockScript));

// 5. Insert Mock Phases
db.prepare(`
  INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, narration_text, narration_word_count, approved, scenes_generated, status, rehook_required)
  VALUES (?, ?, 1, 'hook', 'Intro', 'Intro content', ?, 22, 0, 1, 'done', 0)
`).run(phase1Id, projectId, mockScript.phases[0].narration_text);

db.prepare(`
  INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, narration_text, narration_word_count, approved, scenes_generated, status, rehook_required)
  VALUES (?, ?, 2, 'build_up', 'Process', 'Process content', ?, 17, 0, 1, 'done', 1)
`).run(phase2Id, projectId, mockScript.phases[1].narration_text);

// 6. Insert Mock Credibility Review
const initialIssues = [
  {
    phase_number: 1,
    claim: '12 मिलियन कैन',
    issue_type: 'wrong_number',
    severity: 'high',
    explanation: '12 million cans per minute is physically impossible; the actual rate is 1200.',
    suggested_correction: '1200 कैन'
  },
  {
    phase_number: 2,
    claim: 'सील और पैक करने के बाद, हम इसमें टॉरिन',
    issue_type: 'step_out_of_order',
    severity: 'medium',
    explanation: 'taurine is mixed before sealing the cans.',
    suggested_correction: 'मिश्रण मिलाने के बाद, हम स्टिंग कैन को सील और पैक करते हैं'
  }
];

const mockReview = {
  overall_credibility_score: 3,
  issues: initialIssues,
  summary: 'Factual and numerical inconsistencies found in script.',
  needs_recheck: false,
  stale: false
};

CredibilityReviewRepository.createOrUpdate(projectId, mockReview as any);

// Setup mock LLM router responses
const originalGenerateStream = LLMRouter.generateStream;

LLMRouter.generateStream = async (
  agentName,
  prompt,
  onChunk,
  onComplete,
  onError,
  options
) => {
  console.log(`[MOCK LLM CALL] Agent: "${agentName}"`);

  if (agentName === 'ScriptAgent_CredibilityRewrite') {
    if (prompt.includes('12 मिलियन') || prompt.includes('12 million')) {
      const response = 'क्या आप जानते हैं कि हर एक मिनट में स्टिंग फैक्ट्री 1200 कैन तैयार करती है? यह दुनिया की सबसे तेज़ पैकेजिंग लाइन है।';
      onChunk(response);
      onComplete?.(response);
      return { billing_source: 'ai_studio' };
    } else if (prompt.includes('सील और पैक करने के बाद') || prompt.includes('after packaging')) {
      const response = 'गुप्त टॉरिन और कैफीन का विशेष मिश्रण मिलाने के बाद, हम स्टिंग कैन को पूरी तरह सील और पैक करते हैं ताकि स्वाद बना रहे।';
      onChunk(response);
      onComplete?.(response);
      return { billing_source: 'ai_studio' };
    }
  } else if (agentName === 'HookScorerAgent') {
    const response = JSON.stringify({
      pattern_interrupt: 8,
      stakes_clarity: 8,
      curiosity_gap: 9,
      scroll_stop_power: 8,
      hard_stop_violated: false,
      overall: 8.2,
      feedback: "Great hook quality.",
      suggestions: []
    });
    onChunk(response);
    onComplete?.(response);
    return { billing_source: 'ai_studio' };
  } else if (agentName === 'ScriptAgent' && (prompt.includes('re-engagement beat') || prompt.includes('rehook'))) {
    const response = JSON.stringify({
      validated: true,
      detected_type: "revelation",
      reason: "Clear re-engagement beat present."
    });
    onChunk(response);
    onComplete?.(response);
    return { billing_source: 'ai_studio' };
  } else if (agentName === 'CredibilityReviewerAgent') {
    const response = JSON.stringify({
      overall_credibility_score: 10,
      issues: [],
      summary: "All credibility and fact-checking issues have been resolved."
    });
    onChunk(response);
    onComplete?.(response);
    return { billing_source: 'ai_studio' };
  }

  const err = new Error(`Unhandled mock LLM call for agent ${agentName}`);
  onError(err);
  throw err;
};

// programmatically spin up express app to hit routes
const app = express();
app.use(express.json());
app.use('/api/v1/projects', scriptRouter);

const PORT = 9999;
const server = app.listen(PORT, async () => {
  console.log(`Test Express server listening on port ${PORT}`);

  try {
    // === TEST 1: SINGLE FIX APPLY (Phase 1) ===
    console.log('\n--- Running Test 1: Single Fix Apply (Phase 1) ---');
    const singleFixUrl = `http://localhost:${PORT}/api/v1/projects/${projectId}/script/phases/1/apply-credibility-fix`;
    
    const singleFixResponse = await fetch(singleFixUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issues: [initialIssues[0]],
      }),
    });

    assert.strictEqual(singleFixResponse.status, 200, 'Single fix endpoint returned non-200 status');
    const singleFixData = await singleFixResponse.json() as any;
    assert.ok(singleFixData.success, 'Response was not success');
    console.log('Single Fix Response:', JSON.stringify(singleFixData, null, 2));

    // Verify database updates for Test 1
    const p1 = ScriptRepository.findPhaseByNumber(projectId, 1);
    assert.ok(p1);
    assert.strictEqual(p1.scenes_generated, 0, 'scenes_generated should be reset to 0');
    assert.ok(p1.narration_text?.includes('1200 कैन'), 'Narration was not corrected to 1200 cans');
    assert.ok(!p1.narration_text?.includes('12 मिलियन'), 'Old incorrect narration still exists');

    // Verify credibility review has issues updated and recheck flags set
    const rev1 = CredibilityReviewRepository.findByProjectId(projectId);
    assert.ok(rev1);
    const rev1Data = JSON.parse(rev1.raw_json);
    assert.strictEqual(rev1Data.issues.length, 1, 'Should have exactly 1 issue left');
    assert.strictEqual(rev1Data.issues[0].phase_number, 2, 'Remaining issue should be phase 2');
    assert.strictEqual(rev1Data.needs_recheck, true, 'needs_recheck should be true');
    assert.strictEqual(rev1Data.stale, true, 'stale should be true');

    console.log('✓ Test 1 Passed: Single fix narration updated, scenes invalidated, review issues filtered and flagged stale.');

    // === TEST 2: BULK FIX APPLY & AUTOMATIC REVIEW REGENERATE ===
    console.log('\n--- Running Test 2: Bulk Fix Apply (Apply All) ---');
    const bulkFixUrl = `http://localhost:${PORT}/api/v1/projects/${projectId}/script/apply-all-credibility-fixes`;
    
    const bulkFixResponse = await fetch(bulkFixUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(bulkFixResponse.status, 200, 'Bulk fix endpoint returned non-200 status');
    const bulkFixData = await bulkFixResponse.json() as any;
    assert.ok(bulkFixData.success, 'Response was not success');
    console.log('Bulk Fix Response:', JSON.stringify(bulkFixData, null, 2));

    // Wait a brief moment for async streaming execution to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify database updates for Test 2
    const p2 = ScriptRepository.findPhaseByNumber(projectId, 2);
    assert.ok(p2);
    assert.strictEqual(p2.scenes_generated, 0, 'scenes_generated should be reset to 0 for phase 2');
    assert.ok(p2.narration_text?.includes('गुप्त टॉरिन और कैफीन का विशेष मिश्रण'), 'Phase 2 narration was not corrected');

    // Verify credibility review has all issues resolved and stale flags cleared
    const rev2 = CredibilityReviewRepository.findByProjectId(projectId);
    assert.ok(rev2);
    const rev2Data = JSON.parse(rev2.raw_json);
    assert.strictEqual(rev2Data.issues.length, 0, 'All issues should be resolved');
    assert.strictEqual(rev2Data.needs_recheck, false, 'needs_recheck should be cleared to false');
    assert.strictEqual(rev2Data.stale, false, 'stale should be cleared to false');
    assert.strictEqual(rev2Data.overall_credibility_score, 10, 'Score should be updated to 10');

    console.log('✓ Test 2 Passed: Bulk fixes applied successfully, automatic review regenerated, stale flags cleared.');

    console.log('\n=== All Credibility Fix Verification Tests Passed! ===');
    process.exit(0);

  } catch (err) {
    console.error('\n✗ Test validation failed:', err);
    process.exit(1);
  } finally {
    server.close();
    LLMRouter.generateStream = originalGenerateStream;
  }
});
