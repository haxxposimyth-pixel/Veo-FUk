import { LLMRouter } from '../services/llm-router';
import { GeminiService } from '../services/gemini.service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { BaseAgent } from '../agents/base-agent';
import { GoogleGenAI } from '@google/genai';
import db from '../db/connection';
import assert from 'assert';
import { runMigrations } from '../db/migrations/runner';

class DummyAgent extends BaseAgent {
  constructor() {
    super('DummyAgent');
  }

  async runTest(projectId: string, prompt: string, phaseNum?: number) {
    return this.executeRawCall(
      projectId,
      undefined,
      'gemini-2.5-pro',
      prompt,
      'DummyAgent',
      { temperature: 0.5, phaseNumber: phaseNum }
    );
  }
}

console.log('Running Token and Cost Tracking Integration Tests...');

// Initialize database
try {
  runMigrations();
} catch (e) {}

// Clean up logs for DummyAgent
db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('DummyAgent');

// Mock GoogleGenAI models.generateContentStream to simulate Vertex AI stream with usageMetadata
let mockGenerateContentStream: any = null;
let mockedModels: any = null;
Object.defineProperty(GoogleGenAI.prototype, 'models', {
  configurable: true,
  get() {
    if (!mockedModels) {
      mockedModels = {
        generateContentStream: async (params: any) => {
          if (mockGenerateContentStream) {
            return mockGenerateContentStream(params);
          }
          const generator = async function* () {
            yield {
              text: 'Hello world response',
              usageMetadata: {
                promptTokenCount: 12000,
                candidatesTokenCount: 800,
                cachedContentTokenCount: 10000,
                thoughtsTokenCount: 200,
                totalTokenCount: 12800
              }
            };
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
    const originalSettings = SettingsRepository.getSettings();

    // Enable Vertex AI path in settings
    SettingsRepository.saveSettings({
      vertexEnabled: true,
      gcpProjectId: 'tracking-test-project',
      gcpLocation: 'us-central1',
      geminiEnabled: true
    });

    // Clear singleton cache to force re-initialization
    const routerModule = require('../services/llm-router');
    routerModule.vertexServiceCache.clear();

    // Create a dummy project to satisfy foreign key constraint (non-nullable columns: topic, visual_style)
    const projectId = 'test-project-123';
    db.prepare("INSERT OR REPLACE INTO projects (id, title, topic, visual_style, status) VALUES (?, 'Test Project', 'test topic', 'cinematic', 'pending')").run(projectId);

    const agent = new DummyAgent();

    console.log('Test 1: Execute Vertex AI call and assert token and cost columns...');
    await agent.runTest(projectId, 'Simulate prompt', 3);

    // Query database row
    const log = db.prepare(`
      SELECT * FROM agent_logs
      WHERE agent_name = 'DummyAgent'
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;

    assert.ok(log, 'Agent log should exist');
    assert.strictEqual(log.project_id, projectId);
    assert.strictEqual(log.status, 'success');
    assert.strictEqual(log.model_used, 'gemini-2.5-pro');
    assert.strictEqual(log.tokens_estimated, 0, 'tokens_estimated should be 0 (actual usage)');
    assert.strictEqual(log.billing_source, 'vertex', 'billing_source should be vertex');
    assert.strictEqual(log.phase_number, 3, 'phase_number should be 3');
    assert.strictEqual(log.input_tokens, 12000);
    assert.strictEqual(log.output_tokens, 800);
    assert.strictEqual(log.total_tokens, 12800);
    assert.strictEqual(log.cached_tokens, 10000);
    assert.strictEqual(log.thinking_tokens, 200);

    // Verify Cost Calculation:
    // Model: gemini-2.5-pro
    // inputRate: 1.25, outputRate: 10.0, cachedInputRate: 0.125
    // standardInput = 12000 - 10000 = 2000 tokens
    // inputCost = (2000 / 1e6) * 1.25 = 0.0025
    // cachedCost = (10000 / 1e6) * 0.125 = 0.00125
    // outputCost = (800 / 1e6) * 10.0 = 0.008
    // totalCost = 0.0025 + 0.00125 + 0.008 = 0.01175
    const expectedCost = 0.01175;
    assert.ok(Math.abs(log.cost - expectedCost) < 1e-7, `Expected cost ~0.01175, got ${log.cost}`);
    console.log('  ✓ Test 1 Passed.');

    console.log('Test 2: Execute AI Studio path call and assert cost is 0...');
    
    // Clear logs first to avoid timestamp collision / sorting race condition
    db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('DummyAgent');

    // Insert dummy key to allow routing to pass LLMRouter fallback key checking
    db.prepare(`
      INSERT OR REPLACE INTO gemini_keys (id, key_value, label, is_active, added_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('test-key-id', 'test-key-value-1234567890', 'Test Key', 1, Date.now());

    // Disable Vertex AI in settings to route to AI Studio
    SettingsRepository.saveSettings({
      vertexEnabled: false,
      geminiEnabled: true
    });
    routerModule.vertexServiceCache.clear();

    // Mock AI Studio response path (we override generateStream)
    const originalGenerateStream = GeminiService.prototype.generateStream;
    GeminiService.prototype.generateStream = async function(
      modelName: any, prompt: any, onChunk: any, onComplete: any, onError: any, config: any, explicitApiKey: any, onUsage: any
    ) {
      onChunk('AI Studio text chunk');
      onUsage?.({
        promptTokenCount: 5000,
        candidatesTokenCount: 400,
        cachedContentTokenCount: 1000,
        thoughtsTokenCount: 0,
        totalTokenCount: 5400
      });
      onComplete('AI Studio text chunk');
    } as any;

    await agent.runTest(projectId, 'AI Studio prompt', 4);

    const aiStudioLog = db.prepare(`
      SELECT * FROM agent_logs
      WHERE agent_name = 'DummyAgent'
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;

    assert.ok(aiStudioLog);
    assert.strictEqual(aiStudioLog.tokens_estimated, 0);
    assert.strictEqual(aiStudioLog.billing_source, 'ai_studio');
    assert.strictEqual(aiStudioLog.cost, 0, 'AI Studio costs must be 0 (free tier)');
    assert.strictEqual(aiStudioLog.input_tokens, 5000);
    assert.strictEqual(aiStudioLog.output_tokens, 400);
    assert.strictEqual(aiStudioLog.total_tokens, 5400);
    assert.strictEqual(aiStudioLog.cached_tokens, 1000);
    assert.strictEqual(aiStudioLog.thinking_tokens, 0);
    assert.strictEqual(aiStudioLog.phase_number, 4);
    console.log('  ✓ Test 2 Passed.');

    // Cleanup and restore
    GeminiService.prototype.generateStream = originalGenerateStream;
    SettingsRepository.saveSettings(originalSettings);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    db.prepare('DELETE FROM agent_logs WHERE agent_name = ?').run('DummyAgent');
    db.prepare('DELETE FROM gemini_keys WHERE id = ?').run('test-key-id');

    console.log('All Token & Cost Tracking Integration Tests passed successfully!');
    process.exit(0);

  } catch (err: any) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
