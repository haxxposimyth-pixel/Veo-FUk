import { LLMRouter } from '../services/llm-router';
import { GeminiService, isVertexFailFastError } from '../services/gemini.service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { GoogleGenAI } from '@google/genai';
import assert from 'assert';
import { z } from 'zod';

console.log('Running Vertex AI Optimization Integration & Unit Tests...');

// Mock GoogleGenAI models property
let mockGenerateContent: any = null;
let mockGenerateContentStream: any = null;
let mockedModels: any = null;

Object.defineProperty(GoogleGenAI.prototype, 'models', {
  configurable: true,
  get() {
    if (!mockedModels) {
      mockedModels = {
        generateContent: async (params: any) => {
          if (mockGenerateContent) {
            return mockGenerateContent(params);
          }
          return { text: '{"result": "ok"}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
        },
        generateContentStream: async (params: any) => {
          if (mockGenerateContentStream) {
            return mockGenerateContentStream(params);
          }
          const generator = async function* () {
            yield { text: '{"result": ' };
            yield { text: '"ok"}' };
          };
          return generator();
        }
      };
    }
    return mockedModels;
  },
  set(val) {
    // Allow setting but do nothing/ignore to avoid TypeError in constructor
  }
});

void (async () => {
  try {
    // Save original settings
    const originalSettings = SettingsRepository.getSettings();

    // ─── Test 1: initVertexAI initializes GoogleGenAI client ────────────────
    console.log('Test 1: initVertexAI initializes GoogleGenAI client...');
    const service = new GeminiService('VERTEX_AI_MODE');
    service.initVertexAI('my-test-project', 'us-central1');
    assert.strictEqual((service as any).useVertexAI, true);
    assert.strictEqual((service as any).vertexProjectId, 'my-test-project');
    console.log('  ✓ Passed.');

    // ─── Test 2: Caching / Singleton client reuse ───────────────────────────
    console.log('Test 2: Caching / Singleton client reuse...');
    SettingsRepository.saveSettings({
      vertexEnabled: true,
      gcpProjectId: 'cache-test-project',
      gcpLocation: 'us-east1',
      geminiEnabled: true
    });

    const routerModule = require('../services/llm-router');
    const cacheMap = routerModule.vertexServiceCache;
    assert.ok(cacheMap instanceof Map);
    
    // Clear cache first
    cacheMap.clear();

    const schema = z.object({ result: z.string() });
    
    mockGenerateContentStream = async function* () {
      yield { text: '{"result": "success"}', usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 } };
    };

    const res1 = await LLMRouter.generateJSON('TestAgent', 'test prompt', schema);
    assert.deepStrictEqual(res1.data, { result: 'success' });
    assert.strictEqual(cacheMap.size, 1);
    assert.ok(cacheMap.has('cache-test-project:us-east1'));

    const res2 = await LLMRouter.generateJSON('TestAgent', 'test prompt', schema);
    assert.deepStrictEqual(res2.data, { result: 'success' });
    assert.strictEqual(cacheMap.size, 1); // Caching map size should still be 1!
    console.log('  ✓ Passed.');

    // ─── Test 3: Fail Fast on Auth/Billing/Project Errors ────────────────────
    console.log('Test 3: Fail Fast on Auth/Billing/Project Errors...');
    
    mockGenerateContentStream = async () => {
      throw new Error('403 PERMISSION_DENIED: Vertex AI API has not been used in project cache-test-project before or it is disabled.');
    };

    try {
      await LLMRouter.generateJSON('TestAgent', 'test prompt', schema);
      assert.fail('Should have failed on Vertex 403 error');
    } catch (err: any) {
      assert.ok(isVertexFailFastError(err));
      assert.strictEqual(err.failFast, true);
      assert.ok(err.message.includes('Vertex project rejected — check GCP project ID + billing + Vertex AI API enabled'));
    }
    console.log('  ✓ Passed.');

    // ─── Test 4: 20-second timeout behavior ──────────────────────────────────
    console.log('Test 4: 20-second timeout behavior...');
    
    // Make generateContentStream hang
    mockGenerateContentStream = async () => {
      return new Promise((resolve) => {
        // never resolves
      });
    };

    const startTime = Date.now();
    try {
      const vertexService = new GeminiService('VERTEX_AI_MODE');
      vertexService.initVertexAI('cache-test-project', 'us-east1');
      await vertexService.generateJSON('gemini-2.5-flash', 'test prompt', schema);
      assert.fail('Should have timed out');
    } catch (err: any) {
      const duration = Date.now() - startTime;
      // Should fail around 20 seconds
      assert.ok(duration >= 19000 && duration < 25000, `Duration was ${duration}ms, expected ~20000ms`);
      assert.ok(err.message.includes('Vertex AI request timed out after 20 seconds'));
    }
    console.log('  ✓ Passed.');

    // ─── Test 5: Stream error propagation ────────────────────────────────────
    console.log('Test 5: Stream error propagation...');

    mockGenerateContentStream = async () => {
      throw new Error('Immediate stream setup failure');
    };

    try {
      const vertexService = new GeminiService('VERTEX_AI_MODE');
      vertexService.initVertexAI('cache-test-project', 'us-east1');
      await new Promise<void>((resolve, reject) => {
        vertexService.generateStream(
          'gemini-2.5-flash',
          'test prompt',
          () => {},
          () => resolve(),
          (err) => reject(err)
        );
      });
      assert.fail('Should have propagated stream error');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Immediate stream setup failure');
    }
    console.log('  ✓ Passed.');

    // Restore original settings
    SettingsRepository.saveSettings(originalSettings);
    console.log('All Vertex AI integration and unit tests passed!');
  } catch (testErr) {
    console.error('Test execution failed:', testErr);
    process.exit(1);
  }
})();
