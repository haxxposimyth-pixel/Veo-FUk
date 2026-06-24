import { LLMRouter } from '../services/llm-router';
import { hookScorerAgent } from '../agents/hook-scorer-agent';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import assert from 'assert';

console.log('Running Hook Scorer Median-of-3 & Variance Integration Tests...');

// Run migrations to ensure columns exist
try {
  runMigrations();
} catch (migrationErr) {
  console.error('Migration failed in test:', migrationErr);
}

// Clean up DB logs for HookScorerAgent
db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('HookScorerAgent');

// Keep reference to original generateStream
const originalGenerateStream = LLMRouter.generateStream;

// Test Case 1: Consistent Scoring (No High Variance)
void (async () => {
  let callCount = 0;
  const promptsReceived: string[] = [];

  // Mock generateStream to return 3 distinct, relatively consistent mock scorer outputs
  LLMRouter.generateStream = async (
    agentName,
    prompt,
    onChunk,
    onComplete,
    onError,
    options
  ) => {
    callCount++;
    promptsReceived.push(prompt);

    if (callCount === 1) {
      const resp = JSON.stringify({
        pattern_interrupt: 6,
        stakes_clarity: 6,
        curiosity_gap: 6,
        scroll_stop_power: 6,
        hard_stop_violated: false,
        overall: 6.8,
        feedback: "Good hook 1",
        suggestions: ["Improve title"]
      });
      onChunk(resp);
      onComplete(resp);
    } else if (callCount === 2) {
      const resp = JSON.stringify({
        pattern_interrupt: 8,
        stakes_clarity: 7,
        curiosity_gap: 9,
        scroll_stop_power: 8,
        hard_stop_violated: false,
        overall: 8.0,
        feedback: "Good hook 2",
        suggestions: ["Improve opening"]
      });
      onChunk(resp);
      onComplete(resp);
    } else if (callCount === 3) {
      const resp = JSON.stringify({
        pattern_interrupt: 9,
        stakes_clarity: 8,
        curiosity_gap: 9,
        scroll_stop_power: 8,
        hard_stop_violated: false,
        overall: 8.5,
        feedback: "Good hook 3",
        suggestions: ["Improve opening", "Reduce length"]
      });
      onChunk(resp);
      onComplete(resp);
    }
    return { billing_source: 'ai_studio' };
  };

  try {
    const result = await hookScorerAgent.run(
      null,
      'This is a youtube hook.',
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    // Verify medians
    assert.strictEqual(result.pattern_interrupt, 8);
    assert.strictEqual(result.stakes_clarity, 7);
    assert.strictEqual(result.curiosity_gap, 9);
    assert.strictEqual(result.scroll_stop_power, 8);
    assert.strictEqual(result.overall, 8.0);

    // Verify suggestions are merged & deduplicated
    assert.deepStrictEqual(result.suggestions.sort(), ["Improve opening", "Improve title", "Reduce length"].sort());

    // Verify feedback matches median run (overall score 8.0, so run 2)
    assert.ok(result.feedback === "Good hook 2");

    // Verify variance is returned and is low
    assert.ok(result.score_variance !== undefined);
    assert.ok(result.score_variance <= 1.5);
    assert.ok(!result.suggestions.includes("Score confidence is low — the hook is borderline. Consider strengthening the pattern interrupt."));

    // Verify exactly 3 logs are written in agent_logs
    const logs = db.prepare('SELECT * FROM agent_logs WHERE agent_name = ?').all('HookScorerAgent') as any[];
    assert.strictEqual(logs.length, 3);
    assert.ok(logs.every(log => log.status === 'success'));

    console.log('  ✓ Test Case 1 passed: Consistent scoring computes correct medians, merges suggestions, and logs 3 runs.');
  } catch (err: any) {
    console.error('  ✗ Test Case 1 failed:', err);
    process.exit(1);
  }

  // Test Case 2: High Variance (> 1.5)
  db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('HookScorerAgent');
  callCount = 0;
  promptsReceived.length = 0;

  LLMRouter.generateStream = async (
    agentName,
    prompt,
    onChunk,
    onComplete,
    onError,
    options
  ) => {
    callCount++;
    promptsReceived.push(prompt);

    if (callCount === 1) {
      const resp = JSON.stringify({
        pattern_interrupt: 6,
        stakes_clarity: 6,
        curiosity_gap: 6,
        scroll_stop_power: 6,
        hard_stop_violated: false,
        overall: 6.8,
        feedback: "Great hook",
        suggestions: []
      });
      onChunk(resp);
      onComplete(resp);
    } else if (callCount === 2) {
      const resp = JSON.stringify({
        pattern_interrupt: 8,
        stakes_clarity: 8,
        curiosity_gap: 8,
        scroll_stop_power: 8,
        hard_stop_violated: false,
        overall: 8.0,
        feedback: "Decent hook",
        suggestions: ["Polish"]
      });
      onChunk(resp);
      onComplete(resp);
    } else if (callCount === 3) {
      const resp = JSON.stringify({
        pattern_interrupt: 9,
        stakes_clarity: 9,
        curiosity_gap: 9,
        scroll_stop_power: 9,
        hard_stop_violated: false,
        overall: 10.0,
        feedback: "Poor hook",
        suggestions: ["Re-write"]
      });
      onChunk(resp);
      onComplete(resp);
    }
    return { billing_source: 'ai_studio' };
  };

  try {
    const result = await hookScorerAgent.run(
      null,
      'This is a youtube hook.',
      'dummy-api-key',
      'gemini-2.5-flash-lite'
    );

    // Verify medians
    assert.strictEqual(result.pattern_interrupt, 8);
    assert.strictEqual(result.overall, 8.0);

    // Verify variance is returned and is high (Variance of [9, 4, 8] is ~4.667)
    assert.ok(result.score_variance !== undefined);
    assert.ok(result.score_variance > 1.5);
    
    // Verify the warning suggestion is appended
    assert.ok(result.suggestions.includes("Score confidence is low — the hook is borderline. Consider strengthening the pattern interrupt."));

    console.log('  ✓ Test Case 2 passed: High variance adds low-confidence suggestion.');
  } catch (err: any) {
    console.error('  ✗ Test Case 2 failed:', err);
    process.exit(1);
  }

  // Restore original generateStream
  LLMRouter.generateStream = originalGenerateStream;
  console.log('All Hook Scorer Median-of-3 Integration Tests passed successfully!');
  process.exit(0);
})();
