import { LLMRouter } from '../services/llm-router';
import { ThirdPartyService } from '../services/third-party-service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { runMigrations } from '../db/migrations/runner';
import { BaseAgent } from '../agents/base-agent';
import OpenAI from 'openai';
import { z } from 'zod';
import assert from 'assert';

console.log('Running Third-Party API & LLMRouter Integration Tests...');

// Ensure database migrations are run
try {
  runMigrations();
} catch (migrationErr) {
  console.error('Migration failed in test:', migrationErr);
}

// Backup original settings
const originalSettings = SettingsRepository.getSettings();

// Get the prototype of completions to mock completions.create
const dummyOpenAIInstance = new OpenAI({ apiKey: 'dummy-api-key', baseURL: 'https://dummy.api/v1' });
const completionsProto = Object.getPrototypeOf(dummyOpenAIInstance.chat.completions);
const originalCreate = completionsProto.create;

let mockResponseChunks: string[] = [];
let mockResponseError: any = null;
let createCallCount = 0;
let lastCreateBody: any = null;

completionsProto.create = async function (body: any, _options: any) {
  createCallCount++;
  lastCreateBody = body;
  if (mockResponseError) {
    throw mockResponseError;
  }
  return {
    async *[Symbol.asyncIterator]() {
      for (const content of mockResponseChunks) {
        yield {
          choices: [{ delta: { content } }],
        };
      }
    },
  };
};

const schema = z.object({
  foo: z.string(),
  bar: z.number(),
});

void (async () => {
  try {
    // ─── Test 1: Direct ThirdPartyService Success ────────────────────────────
    console.log('Test 1: Direct ThirdPartyService Success...');
    createCallCount = 0;
    mockResponseError = null;
    mockResponseChunks = ['{', '"foo": "hello", ', '"bar": 42', '}'];

    const service = new ThirdPartyService('test-key', 'https://dummy.api/v1');
    const result = await service.generateJSON('my-model', 'Prompt here', schema);

    assert.deepStrictEqual(result.data, { foo: 'hello', bar: 42 });
    assert.strictEqual(createCallCount, 1);
    assert.strictEqual(lastCreateBody.model, 'my-model');
    console.log('  ✓ Passed.');

    // ─── Test 2: Code Fence Stripping ─────────────────────────────────────────
    console.log('Test 2: Code Fence Stripping...');
    createCallCount = 0;
    mockResponseChunks = ['```json\n', '{"foo": "test", "bar": 100}', '\n```'];

    const result2 = await service.generateJSON('my-model', 'Prompt here', schema);
    assert.deepStrictEqual(result2.data, { foo: 'test', bar: 100 });
    assert.strictEqual(createCallCount, 1);
    console.log('  ✓ Passed.');

    // ─── Test 3: Self-healing Repair ──────────────────────────────────────────
    console.log('Test 3: Self-healing Repair...');
    createCallCount = 0;
    // Attempt 1: Malformed JSON (missing closing brace)
    // Attempt 2: Correct JSON
    let attempts = 0;
    completionsProto.create = async function (body: any, _options: any) {
      attempts++;
      createCallCount++;
      lastCreateBody = body;
      const chunks = attempts === 1
        ? ['{"foo": "error", "bar": '] // Malformed
        : ['{"foo": "fixed", "bar": 99}']; // Fixed
      return {
        async *[Symbol.asyncIterator]() {
          for (const content of chunks) {
            yield {
              choices: [{ delta: { content } }],
            };
          }
        },
      };
    };

    const result3 = await service.generateJSON('my-model', 'Prompt here', schema);
    assert.deepStrictEqual(result3.data, { foo: 'fixed', bar: 99 });
    assert.strictEqual(createCallCount, 2);
    // Verify prompt on second call has the self-healing instructions
    assert.ok(lastCreateBody.messages[0].content.includes('IMPORTANT: Your previous response failed JSON/schema validation.'));
    console.log('  ✓ Passed.');

    // Restore standard mock completions.create
    completionsProto.create = async function (body: any, _options: any) {
      createCallCount++;
      lastCreateBody = body;
      if (mockResponseError) {
        throw mockResponseError;
      }
      return {
        async *[Symbol.asyncIterator]() {
          for (const content of mockResponseChunks) {
            yield {
              choices: [{ delta: { content } }],
            };
          }
        },
      };
    };

    // ─── Test 4: Rate Limit and Auth Errors ────────────────────────────────────
    console.log('Test 4: Authentication & Rate Limit Errors...');
    createCallCount = 0;
    
    // Auth error
    mockResponseError = { status: 401, message: 'Unauthorized' };
    try {
      await service.generateJSON('my-model', 'Prompt here', schema);
      assert.fail('Should have thrown Auth error');
    } catch (err: any) {
      assert.ok(err.message.includes('Third-Party API authentication failed'));
    }

    // Rate Limit error
    mockResponseError = { status: 429, message: 'Too many requests' };
    try {
      await service.generateJSON('my-model', 'Prompt here', schema);
      assert.fail('Should have thrown Rate limit error');
    } catch (err: any) {
      assert.ok(err.message.includes('Third-Party API rate limit exceeded'));
    }
    console.log('  ✓ Passed.');

    // ─── Test 5: LLMRouter Respects geminiEnabled Toggle ──────────────────────
    console.log('Test 5: LLMRouter geminiEnabled Toggle...');
    // Disable gemini, try generating a gemini model
    SettingsRepository.saveSettings({ geminiEnabled: false });

    try {
      await LLMRouter.generateJSON('TestAgent', 'test prompt', z.any(), {
        modelName: 'gemini-2.5-flash-lite',
      });
      assert.fail('Should have thrown error because Gemini is disabled');
    } catch (err: any) {
      assert.ok(err.message.includes('Google Gemini is disabled in AI Settings'));
    }
    console.log('  ✓ Passed.');

    // ─── Test 6: LLMRouter Routes to ThirdPartyService ───────────────────────
    console.log('Test 6: LLMRouter Routing to Third-Party...');
    createCallCount = 0;
    mockResponseError = null;
    mockResponseChunks = ['{"foo": "third-party-router", "bar": 123}'];

    // Configure and enable third party settings
    SettingsRepository.saveSettings({
      thirdPartyEnabled: true,
      thirdPartyModel: 'custom-openrouter-model',
      thirdPartyBaseUrl: 'https://custom.endpoint.com/v1',
      thirdPartyApiKey: 'router-test-key',
    });

    const result6 = await LLMRouter.generateJSON('TestAgent', 'test prompt', schema, {
      modelName: 'custom-openrouter-model',
    });

    assert.deepStrictEqual(result6.data, { foo: 'third-party-router', bar: 123 });
    assert.strictEqual(createCallCount, 1);
    assert.strictEqual(lastCreateBody.model, 'custom-openrouter-model');
    console.log('  ✓ Passed.');

    // ─── Test 7: BaseAgent.generateStructured throws stream errors immediately ───
    console.log('Test 7: BaseAgent.generateStructured throws stream errors immediately...');
    createCallCount = 0;
    mockResponseError = new Error('400 google/gemma-4-31b-it:free is not a valid model ID');

    class TestStreamErrorAgent extends BaseAgent {
      constructor() {
        super('TestStreamErrorAgent');
      }

      async runTest() {
        return this.generateStructured(
          null,
          'dummy-api-key',
          'custom-openrouter-model',
          {
            prompt: 'Test prompt',
            schema: schema,
            maxRepairAttempts: 2,
          }
        );
      }
    }

    const errorAgent = new TestStreamErrorAgent();
    try {
      await errorAgent.runTest();
      assert.fail('Should have thrown stream error immediately');
    } catch (err: any) {
      assert.ok(err.message.includes('google/gemma-4-31b-it:free is not a valid model ID'));
      // Ensure it only attempted 1 time (didn't retry with repair prompt)
      assert.strictEqual(createCallCount, 1);
    }
    console.log('  ✓ Passed.');

  } catch (testErr) {
    console.error('Test execution failed:', testErr);
    process.exit(1);
  } finally {
    // ─── Cleanup ─────────────────────────────────────────────────────────────
    console.log('Cleaning up settings and restoring prototypes...');
    completionsProto.create = originalCreate;
    SettingsRepository.saveSettings(originalSettings);
  }

  console.log('All Third-Party API & LLMRouter Integration Tests passed!');
  process.exit(0);
})();
