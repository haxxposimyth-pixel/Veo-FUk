import { GeminiService, isVertexFailFastError } from './gemini.service';
import { HighwayAPIService } from './highway-api-service';
import { ThirdPartyService } from './third-party-service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { TokenUsage } from '../config/model-pricing';
import { agentProfiles } from '../config/agent-profiles';
import { AGENT_MODEL_MAPPING } from '../config/agent-model-mapping';
import db from '../db/connection';
import { geminiKeyPool } from './gemini-key-pool';

// Mutate AGENT_MODEL_MAPPING to ensure no agent is assigned deprecated models.
if (AGENT_MODEL_MAPPING) {
  for (const key of Object.keys(AGENT_MODEL_MAPPING)) {
    const val = AGENT_MODEL_MAPPING[key];
    if (val.includes('pro')) {
      AGENT_MODEL_MAPPING[key] = 'gemini-2.5-pro';
    } else {
      AGENT_MODEL_MAPPING[key] = 'gemini-2.5-flash';
    }
  }
}
import crypto from 'crypto';
import { z } from 'zod';

// === VVS FIX SAFETY-FALLBACK START ===
export type LLMErrorType =
  | 'PROHIBITED_CONTENT'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'DEAD_KEY'
  | 'UNKNOWN';

export function classifyLLMError(error: unknown): LLMErrorType {
  const msg = error instanceof Error ? error.message : String(error);
  const msgLower = msg.toLowerCase();

  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('api key not valid') ||
    msg.includes('Please pass a valid API key') ||
    msg.includes('ACCOUNT_STATE_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('service account is deleted or disabled') ||
    msg.includes('denied access')
  ) {
    return 'DEAD_KEY';
  }

  if (
    msg.includes('PROHIBITED_CONTENT') ||
    msg.includes('Text not available') ||
    msg.includes('Response was blocked') ||
    msgLower.includes('prohibited_content') ||
    msgLower.includes('safety')
  ) {
    return 'PROHIBITED_CONTENT';
  }

  if (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('quota exhausted') ||
    msg.includes('Quota') ||
    msg.includes('RESOURCE_EXHAUSTED')
  ) {
    return 'QUOTA_EXHAUSTED';
  }

  if (
    msg.includes('Rate-limited') ||
    msg.includes('rate limit') ||
    msgLower.includes('rate_limit')
  ) {
    return 'RATE_LIMITED';
  }

  return 'UNKNOWN';
}
// === VVS FIX SAFETY-FALLBACK END ===

// === VVS OPT FIX-8B START ===
export interface RouterOptions {
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string;
  modelName?: string;
  topP?: number;
  topK?: number;
  timeoutMs?: number;
  onModelChosen?: (model: string) => void;
  onApiKeyIndexChosen?: (index: number) => void;
}

export function sanitizeModel(modelName: string): string {
  if (!modelName) return 'gemini-2.5-flash';
  const clean = modelName.toLowerCase().trim();
  if (
    clean.includes('3.5') ||
    clean.includes('3.1') ||
    clean.includes('1.5') ||
    clean.includes('preview') ||
    clean === 'gemini-pro' ||
    clean === 'gemini-pro-latest' ||
    clean.includes('gemini-2.0-flash')
  ) {
    console.warn(`[LLMRouter] Intercepted deprecated/unsupported model '${modelName}' from settings. Forcing to 'gemini-2.5-flash'.`);
    return 'gemini-2.5-flash';
  }
  return modelName;
}

export const vertexServiceCache = new Map<string, GeminiService>();

function getVertexService(projectId: string, location: string): GeminiService {
  const cacheKey = `${projectId}:${location}`;
  let service = vertexServiceCache.get(cacheKey);
  if (!service) {
    service = new GeminiService('VERTEX_AI_MODE');
    service.initVertexAI(projectId, location);
    vertexServiceCache.set(cacheKey, service);
  }
  return service;
}

export class LLMRouter {
  static activeModel?: string;

  static async generateJSON<T>(
    agentName: string,
    prompt: string,
    zodSchema: z.ZodType<T>,
    options?: RouterOptions,
    onChunk?: (chunk: string) => void,
  ): Promise<{
    data: T;
    inputTokens: number;
    outputTokens: number;
    rawResponseText: string;
    modelUsed?: string;
    cachedTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
    billing_source: 'vertex' | 'ai_studio';
  }> {
    const settings = SettingsRepository.getSettings() as any;
    
    const useAgentRouting = settings.useAgentSpecificRouting !== false;
    let model = '';
    
    if (useAgentRouting) {
      const baseName = agentName.split('_')[0];
      const mappedModel = AGENT_MODEL_MAPPING[agentName] || AGENT_MODEL_MAPPING[baseName];
      if (mappedModel) {
        model = mappedModel;
      }
    }

    if (!model) {
      model = options?.modelName || this.activeModel || settings.active_model || settings.model || 'gemini-2.5-flash';
    }
    model = sanitizeModel(model);

    const profile = agentProfiles[agentName];

    const finalTemp = profile?.temperature ?? options?.temperature ?? settings.temperature ?? 0.7;
    const finalTokens = profile?.maxOutputTokens ?? options?.maxOutputTokens ?? settings.maxTokens ?? 16384;
    const finalTopP = profile?.topP ?? options?.topP ?? settings.topP;
    const finalTopK = profile?.topK ?? options?.topK ?? settings.topK;

    let finalTimeoutMs = options?.timeoutMs;
    if (!finalTimeoutMs) {
      const baseName = agentName.split('_')[0].toLowerCase();
      if (baseName.includes('bible') || baseName.includes('script')) {
        finalTimeoutMs = 180000; // 180s
      } else {
        finalTimeoutMs = 90000; // 90s
      }
    }

    const mergedConfig = {
      temperature: finalTemp,
      maxOutputTokens: finalTokens,
      topP: finalTopP,
      topK: finalTopK,
      timeoutMs: finalTimeoutMs,
    };

    const apiKey = options?.apiKey || settings.geminiApiKey || settings.apiKey;
    const geminiEnabled = settings.geminiEnabled !== false;

    if (!geminiEnabled && (model.startsWith('gemini') || model.startsWith('models/gemini') || model.includes('flash') || model.includes('pro'))) {
      throw new Error('Google Gemini is disabled in AI Settings');
    }

    // Build the fallback list
    const modelsToTry: Array<{ type: 'gemini' | 'highway' | 'thirdparty' | 'local'; model: string }> = [];

    // 1. First try requested model
    if (model && model !== 'disabled') {
      if (model.startsWith('claude')) {
        modelsToTry.push({ type: 'highway', model });
      } else if (model.startsWith('local')) {
        modelsToTry.push({ type: 'local', model });
      } else if (settings.thirdPartyEnabled && settings.thirdPartyModel && model === settings.thirdPartyModel) {
        modelsToTry.push({ type: 'thirdparty', model });
      } else {
        modelsToTry.push({ type: 'gemini', model });
      }
    }

    // 2. Add backups
    const backup1 = sanitizeModel(settings.backupModelPrimary);
    if (backup1 && backup1 !== 'disabled') {
      if (!modelsToTry.some(m => m.model === backup1)) {
        modelsToTry.push({ type: 'gemini', model: backup1 });
      }
    }
    const backup2 = sanitizeModel(settings.backupModelSecondary);
    if (backup2 && backup2 !== 'disabled') {
      if (!modelsToTry.some(m => m.model === backup2)) {
        modelsToTry.push({ type: 'gemini', model: backup2 });
      }
    }

    // 3. Add default Gemini models in order
    const defaultGemini = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
    for (const def of defaultGemini) {
      if (!modelsToTry.some(m => m.type === 'gemini' && m.model === def)) {
        modelsToTry.push({ type: 'gemini', model: def });
      }
    }

    // 4. Add HighwayAPI if enabled
    if (settings.highwayApiEnabled && settings.highwayApiKey) {
      const hModel = settings.highwayApiModel || 'claude-fable-5';
      if (!modelsToTry.some(m => m.type === 'highway')) {
        modelsToTry.push({ type: 'highway', model: hModel });
      }
    }

    // 5. Add ThirdParty if enabled
    if (settings.thirdPartyEnabled && settings.thirdPartyApiKey && settings.thirdPartyModel) {
      if (!modelsToTry.some(m => m.type === 'thirdparty')) {
        modelsToTry.push({ type: 'thirdparty', model: settings.thirdPartyModel });
      }
    }

    const filteredModels = modelsToTry.filter(m => m.type !== 'gemini' || geminiEnabled);

    const runJSONWithFallback = async (modelIdx: number): Promise<{
      data: T;
      inputTokens: number;
      outputTokens: number;
      rawResponseText: string;
      modelUsed?: string;
      cachedTokens?: number;
      thinkingTokens?: number;
      totalTokens?: number;
      billing_source: 'vertex' | 'ai_studio';
    }> => {
      if (modelIdx >= filteredModels.length) {
        throw new Error('All models in fallback chain failed.');
      }
      const step = filteredModels[modelIdx];

      if (step.type === 'gemini') {
        let finalModel = step.model;
        if (!finalModel.startsWith('gemini') && !finalModel.startsWith('models/gemini')) {
          finalModel = 'gemini-2.5-flash';
        }

        const vertexEnabled = settings.vertexEnabled === true;
        const gcpProjectId = settings.gcpProjectId || settings.gcp_project_id;
        const gcpLocation = settings.gcpLocation || settings.gcp_location || 'us-central1';

        if (vertexEnabled && gcpProjectId && gcpProjectId.trim() !== '') {
          try {
            console.log(`[LLMRouter] Direct Vertex AI path for model ${finalModel} in project ${gcpProjectId}`);
            const vertexService = getVertexService(gcpProjectId, gcpLocation);
            const result = await vertexService.generateJSON<T>(
              finalModel,
              prompt,
              zodSchema,
              mergedConfig,
              3,
              onChunk,
              undefined
            );
            options?.onModelChosen?.(step.model);
            return {
              ...result,
              modelUsed: step.model,
              billing_source: 'vertex',
            };
          } catch (err: any) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            // Fallback happens only after underlying model retries (e.g. exponential backoff on 429) fail
            console.warn(`[LLMRouter] Vertex JSON Model ${step.model} failed: ${errorMsg}`);
            
            if (isVertexFailFastError(err)) {
              throw err;
            }

            try {
              const logId = crypto.randomUUID();
              db.prepare(`
                INSERT INTO agent_logs
                  (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
              `).run(
                logId, 
                `${agentName}_Fallback`, 
                step.model, 
                `Vertex failed, falling back. Error: ${errorMsg}`, 
                prompt.slice(0, 1000)
              );
            } catch (logErr) {}

            return await runJSONWithFallback(modelIdx + 1);
          }
        }

        const keysList = options?.apiKey ? [options.apiKey] : [];
        if (keysList.length > 0) {
          geminiKeyPool.loadTransientKeys(keysList);
        } else {
          geminiKeyPool.syncWithDatabase();
        }
        const usePool = true; // DB or transient

        if (usePool) {
          const poolSize = keysList.length;
          let lastError: any = null;
          let poolSuccess = false;
          let result: any = null;
          let keyUsed: string | undefined = undefined;
          let keyIndex = -1;
          let allKeysQuotaOrCooldown = true;

          for (let attemptNum = 0; attemptNum < 80; attemptNum++) {
            const activeKeyInfo = geminiKeyPool.getActiveKeyForModel(step.model);
            if (!activeKeyInfo) {
              console.warn('[LLMRouter] All pool keys are currently cooling down/disabled.');
              break;
            }
            keyUsed = activeKeyInfo.key;
            keyIndex = activeKeyInfo.index;
            console.log(`[GeminiKeyPool] Using key index ${keyIndex} for model ${step.model}`);

            try {
              const geminiService = new GeminiService(keyUsed);

              result = await geminiService.generateJSON<T>(
                finalModel,
                prompt,
                zodSchema,
                mergedConfig,
                3,
                onChunk,
                keyUsed
              );

              geminiKeyPool.reportSuccess(keyUsed, step.model);
              options?.onApiKeyIndexChosen?.(keyIndex);
              poolSuccess = true;
              break;
            } catch (err: any) {
              lastError = err;
              const errorType = classifyLLMError(err);
              if (errorType === 'PROHIBITED_CONTENT') {
                allKeysQuotaOrCooldown = false;
                const safetyError = new Error(
                  `[LLMRouter] PROHIBITED_CONTENT on model ${step.model}. ` +
                  `Prompt requires sanitization before retry. Do not advance fallback chain.`
                );
                (safetyError as any).errorType = 'PROHIBITED_CONTENT';
                (safetyError as any).blockedModel = step.model;
                throw safetyError;
              }

              if (geminiKeyPool.isDeadKeyError(err)) {
                geminiKeyPool.markKeyDead(keyUsed, err.message || '401/403 Invalid API Key');
                console.warn(`[LLMRouter] Pool key index ${keyIndex} is dead (401/403). Quarantined. Rotating to next key...`);
                continue;
              }

              if (geminiKeyPool.isQuotaError(err)) {
                geminiKeyPool.reportQuotaError(keyUsed, step.model, err);
                console.warn(`[LLMRouter] Pool key index ${keyIndex} hit quota/rate-limit. Marked on cooldown. Rotating...`);
                continue;
              }

              // Rotate to next key on any other error
              console.warn(`[LLMRouter] Pool key index ${keyIndex} failed: ${err.message || err}. Rotating to next key...`);
              allKeysQuotaOrCooldown = false;
              continue;
            }
          }

          if (poolSuccess) {
            options?.onModelChosen?.(step.model);
            return {
              ...result,
              modelUsed: step.model,
              billing_source: 'ai_studio',
            };
          } else {
            if (allKeysQuotaOrCooldown && (lastError === null || geminiKeyPool.isQuotaError(lastError) || String(lastError?.message || lastError || '').toLowerCase().includes('cool'))) {
              throw new Error("All Gemini keys are rate-limited / daily-exhausted. Try again later or add more keys.");
            }

            const errorMsg = lastError instanceof Error ? lastError.message : String(lastError || 'All pool keys exhausted');
            console.warn(`[LLMRouter] Gemini Key Pool failed for model ${step.model}: ${errorMsg}. Trying next fallback...`);

            try {
              const logId = crypto.randomUUID();
              db.prepare(`
                INSERT INTO agent_logs
                  (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
              `).run(
                logId, 
                `${agentName}_Fallback`, 
                step.model, 
                `Gemini pool failed, falling back. Error: ${errorMsg}`, 
                prompt.slice(0, 1000)
              );
            } catch (logErr) {}

            return await runJSONWithFallback(modelIdx + 1);
          }
        } else {
          try {
            const geminiService = new GeminiService(apiKey);
            const result = await geminiService.generateJSON<T>(
              finalModel,
              prompt,
              zodSchema,
              mergedConfig,
              3,
              onChunk,
              apiKey
            );
            options?.onModelChosen?.(step.model);
            return {
              ...result,
              modelUsed: step.model,
              billing_source: 'ai_studio',
            };
          } catch (err: any) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[LLMRouter] JSON Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);

            try {
              const logId = crypto.randomUUID();
              db.prepare(`
                INSERT INTO agent_logs
                  (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
              `).run(
                logId, 
                `${agentName}_Fallback`, 
                step.model, 
                `Model failed, falling back. Error: ${errorMsg}`, 
                prompt.slice(0, 1000)
              );
            } catch (logErr) {}

            return await runJSONWithFallback(modelIdx + 1);
          }
        }
      } else if (step.type === 'highway' || step.type === 'local') {
        try {
          options?.onModelChosen?.(step.model);
          const hwKey = step.type === 'highway' ? (settings.highwayApiKey || '') : 'not-needed';
          const hwUrl = step.type === 'highway' ? (settings.highwayApiBaseUrl || 'https://api.highwayapi.ai/openai') : 'http://localhost:1234/v1';
          const highwayService = new HighwayAPIService(hwKey, hwUrl);
          const result = await highwayService.generateJSON(
            step.model,
            prompt,
            zodSchema,
            mergedConfig,
            3,
            onChunk,
          );
          return {
            ...result,
            modelUsed: step.model,
            billing_source: 'ai_studio',
          };
        } catch (err: any) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[LLMRouter] JSON Highway/Local Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);
          return await runJSONWithFallback(modelIdx + 1);
        }
      } else {
        // thirdparty
        try {
          options?.onModelChosen?.(step.model);
          const tpKey = settings.thirdPartyApiKey || '';
          const tpUrl = settings.thirdPartyBaseUrl || 'https://openrouter.ai/api/v1';
          const thirdPartyService = new ThirdPartyService(tpKey, tpUrl);
          const result = await thirdPartyService.generateJSON(
            step.model,
            prompt,
            zodSchema,
            mergedConfig,
            3,
            onChunk,
          );
          return {
            ...result,
            modelUsed: step.model,
            billing_source: 'ai_studio',
          };
        } catch (err: any) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[LLMRouter] JSON ThirdParty Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);
          return await runJSONWithFallback(modelIdx + 1);
        }
      }
    };

    return await runJSONWithFallback(0);
  }

  static async generateStream(
    agentName: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (err: unknown) => void,
    options?: RouterOptions,
    sanitizedPrompt?: string
  ): Promise<{ usage?: TokenUsage; billing_source: 'vertex' | 'ai_studio' }> {
    try {
      const settings = SettingsRepository.getSettings() as any;
      const actualPrompt = sanitizedPrompt !== undefined ? sanitizedPrompt : prompt;
      
      const useAgentRouting = settings.useAgentSpecificRouting !== false;
      let model = '';
      
      if (useAgentRouting) {
        const baseName = agentName.split('_')[0];
        const mappedModel = AGENT_MODEL_MAPPING[agentName] || AGENT_MODEL_MAPPING[baseName];
        if (mappedModel) {
          model = mappedModel;
        }
      }

      if (!model) {
        model = options?.modelName || this.activeModel || settings.active_model || settings.model || 'gemini-2.5-flash';
      }
      model = sanitizeModel(model);

      const profile = agentProfiles[agentName];

      const finalTemp = profile?.temperature ?? options?.temperature ?? settings.temperature ?? 0.8;
      const finalTokens = profile?.maxOutputTokens ?? options?.maxOutputTokens ?? settings.maxTokens ?? 8192;
      const finalTopP = profile?.topP ?? options?.topP ?? settings.topP;
      const finalTopK = profile?.topK ?? options?.topK ?? settings.topK;

      let finalTimeoutMs = options?.timeoutMs;
      if (!finalTimeoutMs) {
        const baseName = agentName.split('_')[0].toLowerCase();
        if (baseName.includes('bible') || baseName.includes('script')) {
          finalTimeoutMs = 180000; // 180s
        } else {
          finalTimeoutMs = 90000; // 90s
        }
      }

      const mergedConfig = {
        temperature: finalTemp,
        maxOutputTokens: finalTokens,
        topP: finalTopP,
        topK: finalTopK,
        timeoutMs: finalTimeoutMs,
      };

      const apiKey = options?.apiKey || settings.geminiApiKey || settings.apiKey;
      const geminiEnabled = settings.geminiEnabled !== false;

      if (!geminiEnabled && (model.startsWith('gemini') || model.startsWith('models/gemini') || model.includes('flash') || model.includes('pro'))) {
        throw new Error('Google Gemini is disabled in AI Settings');
      }

      // Build the fallback list
      const modelsToTry: Array<{ type: 'gemini' | 'highway' | 'thirdparty' | 'local'; model: string }> = [];

      // 1. First try requested model
      if (model && model !== 'disabled') {
        if (model.startsWith('claude')) {
          modelsToTry.push({ type: 'highway', model });
        } else if (model.startsWith('local')) {
          modelsToTry.push({ type: 'local', model });
        } else if (settings.thirdPartyEnabled && settings.thirdPartyModel && model === settings.thirdPartyModel) {
          modelsToTry.push({ type: 'thirdparty', model });
        } else {
          modelsToTry.push({ type: 'gemini', model });
        }
      }

      // 2. Add backups
      const backup1 = sanitizeModel(settings.backupModelPrimary);
      if (backup1 && backup1 !== 'disabled') {
        if (!modelsToTry.some(m => m.model === backup1)) {
          modelsToTry.push({ type: 'gemini', model: backup1 });
        }
      }
      const backup2 = sanitizeModel(settings.backupModelSecondary);
      if (backup2 && backup2 !== 'disabled') {
        if (!modelsToTry.some(m => m.model === backup2)) {
          modelsToTry.push({ type: 'gemini', model: backup2 });
        }
      }

      // 3. Add default Gemini models in order
      const defaultGemini = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
      for (const def of defaultGemini) {
        if (!modelsToTry.some(m => m.type === 'gemini' && m.model === def)) {
          modelsToTry.push({ type: 'gemini', model: def });
        }
      }

      // 4. Add HighwayAPI if enabled
      if (settings.highwayApiEnabled && settings.highwayApiKey) {
        const hModel = settings.highwayApiModel || 'claude-fable-5';
        if (!modelsToTry.some(m => m.type === 'highway')) {
          modelsToTry.push({ type: 'highway', model: hModel });
        }
      }

      // 5. Add ThirdParty if enabled
      if (settings.thirdPartyEnabled && settings.thirdPartyApiKey && settings.thirdPartyModel) {
        if (!modelsToTry.some(m => m.type === 'thirdparty')) {
          modelsToTry.push({ type: 'thirdparty', model: settings.thirdPartyModel });
        }
      }

      const filteredModels = modelsToTry.filter(m => m.type !== 'gemini' || geminiEnabled);

      const runStreamWithFallback = async (modelIdx: number): Promise<{ usage?: TokenUsage; billing_source: 'vertex' | 'ai_studio' }> => {
        if (modelIdx >= filteredModels.length) {
          throw new Error('All models in fallback chain failed.');
        }
        const step = filteredModels[modelIdx];
        if (step.type === 'gemini') {
          let finalModel = step.model;
          if (!finalModel.startsWith('gemini') && !finalModel.startsWith('models/gemini')) {
            finalModel = 'gemini-2.5-flash';
          }

          const vertexEnabled = settings.vertexEnabled === true;
          const gcpProjectId = settings.gcpProjectId || settings.gcp_project_id;
          const gcpLocation = settings.gcpLocation || settings.gcp_location || 'us-central1';

          if (vertexEnabled && gcpProjectId && gcpProjectId.trim() !== '') {
            try {
              console.log(`[LLMRouter] Direct Vertex AI stream path for model ${finalModel} in project ${gcpProjectId}`);
              const vertexService = getVertexService(gcpProjectId, gcpLocation);
              let capturedUsage: TokenUsage | undefined;
              await new Promise<void>((resolvePromise, rejectPromise) => {
                vertexService.generateStream(
                  finalModel,
                  actualPrompt,
                  onChunk,
                  (fullText) => {
                    onComplete(fullText);
                    resolvePromise();
                  },
                  (err) => {
                    rejectPromise(err);
                  },
                  mergedConfig,
                  undefined,
                  (usage) => {
                    capturedUsage = usage;
                  }
                );
              });
              options?.onModelChosen?.(step.model);
              return { usage: capturedUsage, billing_source: 'vertex' };
            } catch (err: any) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              // Fallback happens only after underlying model retries (e.g. exponential backoff on 429) fail
              console.warn(`[LLMRouter] Vertex Stream Model ${step.model} failed: ${errorMsg}`);
              
              if (isVertexFailFastError(err)) {
                throw err;
              }

              try {
                const logId = crypto.randomUUID();
                db.prepare(`
                  INSERT INTO agent_logs
                    (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                  VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
                `).run(
                  logId, 
                  `${agentName}_Fallback`, 
                  step.model, 
                  `Vertex failed, falling back. Error: ${errorMsg}`, 
                  prompt.slice(0, 1000)
                );
              } catch (logErr) {}

              return await runStreamWithFallback(modelIdx + 1);
            }
          }

          const keysList = options?.apiKey ? [options.apiKey] : [];
          if (keysList.length > 0) {
            geminiKeyPool.loadTransientKeys(keysList);
          } else {
            geminiKeyPool.syncWithDatabase();
          }
          const usePool = true;

          if (usePool) {
            const poolSize = keysList.length;
            let lastError: any = null;
            let poolSuccess = false;
            let keyUsed: string | undefined = undefined;
            let keyIndex = -1;
            let allKeysQuotaOrCooldown = true;
            let capturedUsage: TokenUsage | undefined;

            for (let attemptNum = 0; attemptNum < 80; attemptNum++) {
              const activeKeyInfo = geminiKeyPool.getActiveKeyForModel(step.model);
              if (!activeKeyInfo) {
                console.warn('[LLMRouter] All pool keys are currently cooling down/disabled.');
                break;
              }
              keyUsed = activeKeyInfo.key;
              keyIndex = activeKeyInfo.index;
              console.log(`[GeminiKeyPool] Using key index ${keyIndex} for model ${step.model}`);

              try {
                const geminiService = new GeminiService(keyUsed);

                await new Promise<void>((resolvePromise, rejectPromise) => {
                  geminiService.generateStream(finalModel,
                    actualPrompt,
                    onChunk,
                    (fullText) => {
                      onComplete(fullText);
                      resolvePromise();
                    },
                    (err) => {
                      rejectPromise(err);
                    },
                    mergedConfig,
                    keyUsed,
                    (usage) => {
                      capturedUsage = usage;
                    }
                  );
                });

                geminiKeyPool.reportSuccess(keyUsed, step.model);
                options?.onApiKeyIndexChosen?.(keyIndex);
                poolSuccess = true;
                break;
              } catch (err: any) {
                lastError = err;
                const errorType = classifyLLMError(err);
                if (errorType === 'PROHIBITED_CONTENT') {
                  allKeysQuotaOrCooldown = false;
                  const safetyError = new Error(
                    `[LLMRouter] PROHIBITED_CONTENT on model ${step.model}. ` +
                    `Prompt requires sanitization before retry. Do not advance fallback chain.`
                  );
                  (safetyError as any).errorType = 'PROHIBITED_CONTENT';
                  (safetyError as any).blockedModel = step.model;
                  throw safetyError;
                }

                if (geminiKeyPool.isDeadKeyError(err)) {
                  geminiKeyPool.markKeyDead(keyUsed, err.message || '401/403 Invalid API Key');
                  console.warn(`[LLMRouter] Pool key index ${keyIndex} is dead (401/403). Quarantined. Rotating to next key...`);
                  continue;
                }

                if (geminiKeyPool.isQuotaError(err)) {
                  geminiKeyPool.reportQuotaError(keyUsed, step.model, err);
                  console.warn(`[LLMRouter] Pool key index ${keyIndex} hit quota/rate-limit. Marked on cooldown. Rotating...`);
                  continue;
                }

                // Rotate to next key on any other error
                console.warn(`[LLMRouter] Pool key index ${keyIndex} failed: ${err.message || err}. Rotating to next key...`);
                allKeysQuotaOrCooldown = false;
                continue;
              }
            }

            if (poolSuccess) {
              options?.onModelChosen?.(step.model);
              return { usage: capturedUsage, billing_source: 'ai_studio' };
            } else {
              if (allKeysQuotaOrCooldown && (lastError === null || geminiKeyPool.isQuotaError(lastError) || String(lastError?.message || lastError || '').toLowerCase().includes('cool'))) {
                throw new Error("All Gemini keys are rate-limited / daily-exhausted. Try again later or add more keys.");
              }

              const errorMsg = lastError instanceof Error ? lastError.message : String(lastError || 'All pool keys exhausted');
              console.warn(`[LLMRouter] Gemini Key Pool failed: ${errorMsg}. Trying next fallback...`);

              try {
                const logId = crypto.randomUUID();
                db.prepare(`
                  INSERT INTO agent_logs
                    (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                  VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
                `).run(
                  logId, 
                  `${agentName}_Fallback`, 
                  step.model, 
                  `Gemini pool failed, falling back. Error: ${errorMsg}`, 
                  prompt.slice(0, 1000)
                );
              } catch (logErr) {}

              return await runStreamWithFallback(modelIdx + 1);
            }
          } else {
            try {
              const geminiService = new GeminiService(apiKey);
              let capturedUsage: TokenUsage | undefined;
              await new Promise<void>((resolvePromise, rejectPromise) => {
                geminiService.generateStream(finalModel,
                  actualPrompt,
                  onChunk,
                  (fullText) => {
                    onComplete(fullText);
                    resolvePromise();
                  },
                  (err) => {
                    rejectPromise(err);
                  },
                  mergedConfig,
                  apiKey,
                  (usage) => {
                    capturedUsage = usage;
                  }
                );
              });
              options?.onModelChosen?.(step.model);
              return { usage: capturedUsage, billing_source: 'ai_studio' };
            } catch (err: any) {
              const safetyError = new Error(
                `[LLMRouter] PROHIBITED_CONTENT on model ${step.model}. ` +
                `Prompt requires sanitization before retry. Do not advance fallback chain.`
              );
              (safetyError as any).errorType = 'PROHIBITED_CONTENT';
              (safetyError as any).blockedModel = step.model;
              
              const errorType = classifyLLMError(err);
              if (errorType === 'PROHIBITED_CONTENT') {
                throw safetyError;
              }

              const errorMsg = err instanceof Error ? err.message : String(err);
              console.warn(`[LLMRouter] Stream Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);
              
              try {
                const logId = crypto.randomUUID();
                db.prepare(`
                  INSERT INTO agent_logs
                    (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response)
                  VALUES (?, NULL, ?, ?, NULL, NULL, 0, 'failed', ?, ?, NULL)
                `).run(
                  logId, 
                  `${agentName}_Fallback`, 
                  step.model, 
                  `Model failed, falling back. Error: ${errorMsg}`, 
                  prompt.slice(0, 1000)
                );
              } catch (logErr) {}

              return await runStreamWithFallback(modelIdx + 1);
            }
          }
        } else if (step.type === 'highway' || step.type === 'local') {
          try {
            options?.onModelChosen?.(step.model);
            const hwKey = step.type === 'highway' ? (settings.highwayApiKey || '') : 'not-needed';
            const hwUrl = step.type === 'highway' ? (settings.highwayApiBaseUrl || 'https://api.highwayapi.ai/openai') : 'http://localhost:1234/v1';
            const highwayService = new HighwayAPIService(hwKey, hwUrl);
            await highwayService.generateStream(
              step.model,
              actualPrompt,
              onChunk,
              onComplete,
              onError,
              mergedConfig,
            );
            return { billing_source: 'ai_studio' };
          } catch (err: any) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[LLMRouter] Stream Highway/Local Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);
            return await runStreamWithFallback(modelIdx + 1);
          }
        } else {
          // thirdparty
          try {
            options?.onModelChosen?.(step.model);
            const tpKey = settings.thirdPartyApiKey || '';
            const tpUrl = settings.thirdPartyBaseUrl || 'https://openrouter.ai/api/v1';
            const thirdPartyService = new ThirdPartyService(tpKey, tpUrl);
            await thirdPartyService.generateStream(
              step.model,
              actualPrompt,
              onChunk,
              onComplete,
              onError,
              mergedConfig,
            );
            return { billing_source: 'ai_studio' };
          } catch (err: any) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[LLMRouter] Stream ThirdParty Model ${step.model} failed: ${errorMsg}. Trying next fallback...`);
            return await runStreamWithFallback(modelIdx + 1);
          }
        }
      };

      return await runStreamWithFallback(0);
    } catch (err) {
      onError(err);
      throw err;
    }
  }
}
