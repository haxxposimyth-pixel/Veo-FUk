import { Router } from 'express';
import type { Request, Response } from 'express';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { settingsUpdateSchema } from 'shared';
import { validateBody } from '../middleware/validate.middleware';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiService } from '../services/gemini.service';
import { geminiKeyPool } from '../services/gemini-key-pool';
import OpenAI from 'openai';
import { z } from 'zod';
import db, { absoluteDbPath } from '../db/connection';
import fs from 'fs';

const router = Router();

const validateKeySchema = z.object({
  apiKey: z.string().min(1),
  provider: z.enum(['gemini', 'highway', 'third-party']).optional(),
  baseUrl: z.string().optional(),
});

function getStats(settings: any) {
  let projectCount = 0;
  let totalPrompts = 0;
  let dbSize = '0 KB';
  let modelUsage = undefined;
  let allModelUsages: Record<string, { model: string; tokensUsed: number; tokensLimit: number; requestsUsed: number; requestsLimit: number }> = {};

  try {
    const pRow   = db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number };
    const vRow   = db.prepare('SELECT COUNT(*) as c FROM veo_prompts').get() as { c: number };
    projectCount = pRow?.c ?? 0;
    totalPrompts = vRow?.c ?? 0;

    if (absoluteDbPath && fs.existsSync(absoluteDbPath)) {
      const { size } = fs.statSync(absoluteDbPath);
      dbSize = `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    const MODEL_LIMITS: Record<string, { requests: number; tokens: number }> = {
      'gemini-2.5-flash-lite': { requests: 1500, tokens: 1000000 },
      'gemini-2.5-flash': { requests: 1500, tokens: 1000000 },
      'gemini-2.0-flash-001': { requests: 1500, tokens: 1000000 },
      'gemini-2.0-flash': { requests: 1500, tokens: 1000000 },
      'gemini-flash-latest': { requests: 1500, tokens: 1000000 },
      'gemini-1.5-flash': { requests: 1500, tokens: 1000000 },
      'gemini-pro-latest': { requests: 50, tokens: 200000 },
      'gemini-1.5-pro': { requests: 50, tokens: 200000 },
      'gemini-2.5-pro': { requests: 50, tokens: 200000 },
      'claude-fable-5': { requests: 200, tokens: 500000 },
      'local-llama-3': { requests: 1000, tokens: 2000000 },
      'local-mistral-7b': { requests: 1000, tokens: 2000000 },
    };

    const model = settings.model || 'gemini-2.5-flash-lite';
    const limitObj = MODEL_LIMITS[model] || { requests: 1000, tokens: 1000000 };
    
    const usageRow = db.prepare(`
      SELECT 
        COUNT(*) as req_count,
        SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as token_count
      FROM agent_logs
      WHERE model_used = ? AND created_at >= datetime('now', '-24 hours')
    `).get(model) as { req_count: number; token_count: number | null };

    const requestsUsed = usageRow?.req_count ?? 0;
    const tokensUsed = usageRow?.token_count ?? 0;

    modelUsage = {
      model,
      tokensUsed,
      tokensLimit: limitObj.tokens,
      requestsUsed,
      requestsLimit: limitObj.requests,
    };

    // Calculate usage stats for all models
    const usageRows = db.prepare(`
      SELECT 
        model_used,
        COUNT(*) as req_count,
        SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as token_count
      FROM agent_logs
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY model_used
    `).all() as Array<{ model_used: string; req_count: number; token_count: number | null }>;

    for (const [mName, limits] of Object.entries(MODEL_LIMITS)) {
      allModelUsages[mName] = {
        model: mName,
        tokensUsed: 0,
        tokensLimit: limits.tokens,
        requestsUsed: 0,
        requestsLimit: limits.requests,
      };
    }

    for (const row of usageRows) {
      const mName = row.model_used;
      const limits = MODEL_LIMITS[mName] || { requests: 1000, tokens: 1000000 };
      allModelUsages[mName] = {
        model: mName,
        tokensUsed: row.token_count ?? 0,
        tokensLimit: limits.tokens,
        requestsUsed: row.req_count,
        requestsLimit: limits.requests,
      };
    }
  } catch (err) {
    console.error('Failed to compute settings stats:', err);
  }

  // Per-key breakdown for the last 24 hours
  let keyUsageBreakdown: Record<number, { requests: number; tokens: number }> = {};
  try {
    const keyUsageRows = db.prepare(`
      SELECT 
        api_key_index,
        COUNT(*) as req_count,
        SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as token_count
      FROM agent_logs
      WHERE created_at >= datetime('now', '-24 hours') AND api_key_index IS NOT NULL
      GROUP BY api_key_index
    `).all() as Array<{ api_key_index: number; req_count: number; token_count: number | null }>;

    for (const row of keyUsageRows) {
      keyUsageBreakdown[row.api_key_index] = {
        requests: row.req_count,
        tokens: row.token_count ?? 0,
      };
    }
  } catch (err) {
    console.error('Failed to query key usage breakdown:', err);
  }

  return { projectCount, totalPrompts, dbSize, modelUsage, allModelUsages, keyUsageBreakdown };
}

// GET /api/v1/settings
router.get('/', (_req: Request, res: Response) => {
  const settings = SettingsRepository.getSettings();
  geminiKeyPool.syncWithDatabase();
  const stats = getStats(settings);
  const keyStatuses = geminiKeyPool.getStatuses();
  res.json({ success: true, data: { ...settings, stats, keyStatuses } });
});

// PUT /api/v1/settings
router.put('/', validateBody(settingsUpdateSchema), (req: Request, res: Response) => {
  SettingsRepository.saveSettings(req.body);
  
  if (req.body.geminiApiKeys && Array.isArray(req.body.geminiApiKeys)) {
    const newKeys = req.body.geminiApiKeys.map((k: string) => k.trim()).filter(Boolean);
    const crypto = require('crypto');
    if (newKeys.length > 0) {
      const placeholders = newKeys.map(() => '?').join(',');
      db.prepare(`UPDATE gemini_keys SET is_active = 0 WHERE key_value NOT IN (${placeholders})`).run(...newKeys);
    } else {
      db.prepare(`UPDATE gemini_keys SET is_active = 0`).run();
    }
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO gemini_keys (id, key_value, label, is_active, added_at) VALUES (?, ?, 'Bulk Added', 1, ?)`);
    const updateStmt = db.prepare(`UPDATE gemini_keys SET is_active = 1 WHERE key_value = ?`);
    for (const k of newKeys) {
      const resUpdate = updateStmt.run(k);
      if (resUpdate.changes === 0) {
        insertStmt.run(crypto.randomUUID(), k, Date.now());
      }
    }
  }
  
  const settings = SettingsRepository.getSettings();
  geminiKeyPool.syncWithDatabase();
  const stats = getStats(settings);
  const keyStatuses = geminiKeyPool.getStatuses();
  res.json({ success: true, data: { ...settings, stats, keyStatuses } });
});

// POST /api/v1/settings/validate-key
router.post('/validate-key', validateBody(validateKeySchema), async (req: Request, res: Response) => {
  const { apiKey, provider, baseUrl } = req.body;
  try {
    if (provider === 'highway') {
      const url = baseUrl || 'https://api.highwayapi.ai/openai';
      const openai = new OpenAI({
        apiKey,
        baseURL: url,
      });
      // Try listing models or simple completion as a validation step
      await openai.models.list();
      res.json({ success: true, message: 'HighwayAPI Key is valid.' });
    } else if (provider === 'third-party') {
      const url = baseUrl || 'https://openrouter.ai/api/v1';
      const openai = new OpenAI({
        apiKey,
        baseURL: url,
      });
      await openai.models.list();
      res.json({ success: true, message: 'Third-Party API Key is valid.' });
    } else {
      const projectId = await GeminiService.resolveProjectId(apiKey);
      const requestOptions = projectId ? {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: `v1/projects/${projectId}/locations/global/publishers/google`
      } : undefined;

      // Try listing models first if not an AQ. key, as it doesn't consume prompt/generation quota
      let isValid = false;
      let message = 'Gemini API Key is valid.';

      try {
        if (!projectId) {
          await GeminiService.getAvailableModels(apiKey);
          isValid = true;
        }
      } catch (listErr: any) {
        const errMsg = listErr.message || '';
        if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('limit')) {
          isValid = true;
          message = 'Gemini API Key is valid, but the free tier rate/quota limit has been exceeded.';
        }
      }

      if (isValid) {
        res.json({ success: true, message });
      } else {
        // Fallback to generateContent validation (e.g. for AQ. keys or if listModels failed for other reasons)
        const genAI  = new GoogleGenerativeAI(apiKey);
        const modelName = projectId ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';
        const model  = genAI.getGenerativeModel({ model: modelName }, requestOptions);
        
        try {
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Reply with only the word OK' }] }]
          });
          if (result?.response) {
            res.json({ success: true, message: 'Gemini API Key is valid.' });
          } else {
            throw new Error('No response from model');
          }
        } catch (genErr: any) {
          const errMsg = genErr.message || '';
          if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('limit')) {
            res.json({ 
              success: true, 
              message: 'Gemini API Key is valid, but the free tier rate/quota limit has been exceeded.' 
            });
          } else {
            throw genErr;
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid API key or connection issue';
    res.status(400).json({ success: false, error: msg, code: 'INVALID_API_KEY' });
  }
});

// GET /api/v1/settings/available-models
router.get('/available-models', async (_req: Request, res: Response) => {
  try {
    const settings = SettingsRepository.getSettings();
    const models: { value: string; label: string }[] = [];

    // Gemini models if enabled and key is set
    geminiKeyPool.syncWithDatabase();
    const activeKeyInfo = geminiKeyPool.getActiveKeyForModel('gemini-2.5-flash');
    const apiKey = activeKeyInfo?.key || settings.geminiApiKey || settings.apiKey;
    if (settings.geminiEnabled !== false && apiKey) {
      try {
        const dynamicModels = await GeminiService.getAvailableModels(apiKey);
        dynamicModels.forEach(m => {
          let cleanLabel = m;
          if (m.startsWith('gemini')) {
            cleanLabel = m.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          }
          models.push({ value: m, label: `${cleanLabel} (Google)` });
        });
      } catch (dynamicErr) {
        console.warn('Failed to fetch dynamic models from Google, using default list:', dynamicErr);
        models.push(
          { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Google)' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Google)' },
          { value: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 001 (Google)' },
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Google)' },
          { value: 'gemini-flash-latest', label: 'Gemini 1.5 Flash (Google)' },
          { value: 'gemini-pro-latest', label: 'Gemini 1.5 Pro (Google)' },
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)' }
        );
      }
    }

    // HighwayAPI models if key is set
    if (settings.highwayApiKey) {
      models.push(
        { value: 'claude-fable-5', label: 'Claude Fable 5 (HighwayAPI)' }
      );
    }

    // Local LM models if local LM is enabled
    if (settings.localLmEnabled) {
      models.push(
        { value: 'local-llama-3', label: 'Llama 3 (Local LM)' },
        { value: 'local-mistral-7b', label: 'Mistral 7B (Local LM)' }
      );
    }

    // Third-Party models if enabled and configured
    if (settings.thirdPartyEnabled && settings.thirdPartyModel) {
      models.push(
        { value: settings.thirdPartyModel, label: `${settings.thirdPartyModel} (Third-Party)` }
      );
    }

    res.json({ success: true, data: models });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/settings/test-model
router.post('/test-model', async (req: Request, res: Response) => {
  const { model, apiKey } = req.body;
  const settings = SettingsRepository.getSettings();
  const keyToUse = apiKey || settings.geminiApiKey || settings.apiKey;
  
  if (!keyToUse) {
    return res.status(400).json({ success: false, error: 'Gemini API key is required to test models.' });
  }
  
  try {
    const result = await GeminiService.testModel(keyToUse, model);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/agent-logs
router.get('/agent-logs', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const logs = db.prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for concurrency-controlled mapping
async function runWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => { executing.delete(p); });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// POST /api/v1/settings/keys/validate
router.post('/keys/validate', async (_req: Request, res: Response) => {
  try {
    const keys = db.prepare("SELECT id, key_value FROM gemini_keys WHERE is_active = 1").all() as { id: string, key_value: string }[];
    
    await runWithLimit(keys, 5, async (k) => {
      try {
        const testRes = await GeminiService.testModel(k.key_value, 'gemini-2.5-flash');
        if (testRes.success) {
          db.prepare("UPDATE gemini_keys SET status = 'active', error_reason = NULL, last_checked_at = ? WHERE id = ?")
            .run(Date.now(), k.id);
        } else {
          const errMsg = testRes.error || 'Validation failed';
          const isDead = geminiKeyPool.isDeadKeyError({ message: errMsg });
          const isQuota = geminiKeyPool.isQuotaError({ message: errMsg });
          
          if (isDead) {
            db.prepare("UPDATE gemini_keys SET status = 'disabled', error_reason = ?, last_checked_at = ? WHERE id = ?")
              .run(errMsg, Date.now(), k.id);
          } else if (isQuota) {
            db.prepare("UPDATE gemini_keys SET status = 'active', error_reason = 'quota_exhausted', last_checked_at = ? WHERE id = ?")
              .run(Date.now(), k.id);
          } else {
            db.prepare("UPDATE gemini_keys SET status = 'disabled', error_reason = ?, last_checked_at = ? WHERE id = ?")
              .run(errMsg, Date.now(), k.id);
          }
        }
      } catch (e: any) {
        db.prepare("UPDATE gemini_keys SET status = 'disabled', error_reason = ?, last_checked_at = ? WHERE id = ?")
          .run(e.message || String(e), Date.now(), k.id);
      }
    });

    geminiKeyPool.syncWithDatabase();
    
    const settings = SettingsRepository.getSettings();
    const stats = getStats(settings);
    const keyStatuses = geminiKeyPool.getStatuses();
    res.json({ success: true, keyStatuses, data: { ...settings, stats, keyStatuses } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/settings/keys/remove-dead
router.post('/keys/remove-dead', async (_req: Request, res: Response) => {
  try {
    db.prepare("DELETE FROM gemini_keys WHERE status = 'disabled'").run();
    
    const settings = SettingsRepository.getSettings();
    const remainingKeys = db.prepare("SELECT key_value FROM gemini_keys WHERE is_active = 1").all() as { key_value: string }[];
    const keyValues = remainingKeys.map(rk => rk.key_value);
    
    settings.geminiApiKeys = keyValues;
    settings.geminiApiKey = keyValues[0] || '';
    SettingsRepository.saveSettings(settings);

    geminiKeyPool.syncWithDatabase();
    
    const stats = getStats(settings);
    const keyStatuses = geminiKeyPool.getStatuses();
    res.json({ success: true, keyStatuses, data: { ...settings, stats, keyStatuses } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
