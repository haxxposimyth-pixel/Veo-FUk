import { LLMRouter } from '../services/llm-router';
import { BaseAgent } from '../agents/base-agent';
import { StructuredOutputError } from '../utils/structured-output.error';
import db from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import { z } from 'zod';
import assert from 'assert';

console.log('Running Agent Self-Healing Repair Integration Tests...');

// Run migrations to ensure columns exist
try {
  runMigrations();
} catch (migrationErr) {
  console.error('Migration failed in test:', migrationErr);
}

// Clean up DB logs for TestAgent
db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('TestAgent');

class TestAgent extends BaseAgent {
  constructor() {
    super('TestAgent');
  }

  async runTest(prompt: string, schema: z.ZodType<any>, maxRepairAttempts?: number) {
    return this.generateStructured(
      null,
      'dummy-api-key',
      'gemini-2.5-flash-lite',
      {
        prompt,
        schema,
        maxRepairAttempts,
      }
    );
  }
}

// Keep reference to original generateStream
const originalGenerateStream = LLMRouter.generateStream;

// Test Case 1: First call returns malformed JSON, second call succeeds (Self-healing succeeds)
void (async () => {
  const agent = new TestAgent();
  const schema = z.object({
    success: z.boolean(),
    score: z.number(),
  });

  let callCount = 0;
  const promptsReceived: string[] = [];

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
      // Return JSON with incorrect type to trigger Zod schema validation failure
      onChunk('{"success": true, "score": "invalid-string"}');
      onComplete('{"success": true, "score": "invalid-string"}');
    } else if (callCount === 2) {
      // Return valid JSON
      onChunk('{"success": true, "score": 9.5}');
      onComplete('{"success": true, "score": 9.5}');
    }
    return { billing_source: 'ai_studio' };
  };

  try {
    const result = await agent.runTest('Generate a score.', schema);
    
    assert.deepStrictEqual(result, { success: true, score: 9.5 });
    assert.strictEqual(callCount, 2);
    
    // Verify prompts
    assert.ok(promptsReceived[0].includes('Generate a score.'));
    assert.ok(promptsReceived[1].includes('Your previous response failed validation.'));
    assert.ok(promptsReceived[1].includes('{"success": true, "score": "invalid-string"}'));
    assert.ok(promptsReceived[1].includes('=== VALIDATION ERRORS TO FIX ==='));

    // Check database log
    const log = db.prepare('SELECT * FROM agent_logs WHERE agent_name = ? ORDER BY created_at DESC LIMIT 1').get('TestAgent') as any;
    assert.ok(log);
    assert.strictEqual(log.status, 'success');
    assert.strictEqual(log.repair_attempts, 1);
    assert.strictEqual(log.output_response, '{"success": true, "score": 9.5}');

    console.log('  ✓ Test Case 1 passed: First call malformed, repair succeeds.');
  } catch (err: any) {
    console.error('  ✗ Test Case 1 failed:', err);
    process.exit(1);
  }

  // Test Case 2: Both calls fail (Self-healing fails, throws StructuredOutputError)
  db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('TestAgent');
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
      // JSON valid, but validation fails (score is string, expected number)
      onChunk('{"success": false, "score": "invalid"}');
      onComplete('{"success": false, "score": "invalid"}');
    } else {
      // Still invalid
      onChunk('{"success": false, "score": "still-invalid"}');
      onComplete('{"success": false, "score": "still-invalid"}');
    }
    return { billing_source: 'ai_studio' };
  };

  try {
    await agent.runTest('Generate a score.', schema);
    assert.fail('Should have thrown StructuredOutputError');
  } catch (err: any) {
    if (!(err instanceof StructuredOutputError)) {
      console.error('  ✗ Test Case 2 failed: Expected StructuredOutputError but got', err);
      process.exit(1);
    }

    assert.strictEqual(err.agentName, 'TestAgent');
    assert.strictEqual(err.attemptCount, 2);
    assert.strictEqual(err.rawOutput, '{"success": false, "score": "still-invalid"}');
    assert.ok(err.zodIssues.length > 0);
    assert.ok(err.zodIssues[0].message.includes('Expected number, received string'));

    // Check database log for failed status
    const log = db.prepare('SELECT * FROM agent_logs WHERE agent_name = ? ORDER BY created_at DESC LIMIT 1').get('TestAgent') as any;
    assert.ok(log);
    assert.strictEqual(log.status, 'failed');
    assert.strictEqual(log.repair_attempts, 1);
    assert.strictEqual(log.output_response, '{"success": false, "score": "still-invalid"}');
    assert.ok(log.error_message.includes('Expected number, received string'));

    console.log('  ✓ Test Case 2 passed: Both calls invalid, throws StructuredOutputError and logs fail status.');
  }

  // Restore original generateStream
  LLMRouter.generateStream = originalGenerateStream;
  console.log('All Agent Self-Healing Repair Integration Tests passed successfully!');
  process.exit(0);
})();
