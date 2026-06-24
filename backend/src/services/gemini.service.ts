// VERTEX AI AUTHENTICATION REQUIREMENTS:
// 1. Create a GCP Service Account in your project with the role:
//    roles/aiplatform.user
// 2. Download the service account JSON key file.
// 3. Set environment variable before starting the backend:
//    GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
//    (For local dev: run "gcloud auth application-default login" instead)
// 4. The GCP project ID must be set in VVS Studio Settings as key:
//    "gcp_project_id" (value: your GCP project ID, e.g. "my-gcp-project")
// 5. The GCP location must be set in VVS Studio Settings as key:
//    "gcp_location" (value: e.g. "us-central1")
// 6. Vertex AI model names may differ from AI Studio names. Confirmed
//    working model strings for Vertex AI us-central1 as of 2025:
//    "gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-preview-04-17",
//    "gemini-2.0-flash-001", "gemini-1.5-flash-002"
// 7. Run npm install at the MONOREPO ROOT (not inside backend/) after
//    modifying backend/package.json

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { GEMINI_BACKOFF_BASE_MS, GEMINI_BACKOFF_MAX_RETRIES } from 'shared';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { TokenUsage } from '../config/model-pricing';

// === VVS VERTEX AI IMPORTS START ===
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
// === VVS VERTEX AI IMPORTS END ===

// === VVS VERTEX AI SAFETY SETTINGS START ===
// BLOCK_ONLY_HIGH prevents false-positive safety blocks on
// animated/documentary/historical content.
// These thresholds only apply to Vertex AI mode.
const VERTEX_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];
// === VVS VERTEX AI SAFETY SETTINGS END ===

interface GenerateJSONResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  rawResponseText: string;
  cachedTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  private static clients = new Map<string, GoogleGenerativeAI>();
  private static hasLoggedAvailableModels = false;

  private static getClient(apiKey: string): GoogleGenerativeAI {
    let client = this.clients.get(apiKey);
    if (!client) {
      client = new GoogleGenerativeAI(apiKey);
      this.clients.set(apiKey, client);
    }
    return client;
  }

  // === VVS VERTEX AI INIT START ===
  // Vertex AI client — initialized only if gcp_project_id is configured
  private vertexClient: GoogleGenAI | null = null;
  private vertexProjectId: string | null = null;
  private vertexLocation: string = 'us-central1';
  private useVertexAI: boolean = false;

  // Call this method after loading settings from the database.
  // In llm-router.ts, call geminiService.initVertexAI(projectId, location)
  // if gcp_project_id is present in settings.
  public initVertexAI(projectId: string, location: string = 'us-central1'): void {
    if (!projectId || projectId.trim() === '') {
      // No project ID configured — stay in AI Studio mode
      this.useVertexAI = false;
      return;
    }
    try {
      this.vertexClient = new GoogleGenAI({ project: projectId, location, vertexai: true });
      this.vertexProjectId = projectId;
      this.vertexLocation = location;
      this.useVertexAI = true;
      console.info(
        `[GeminiService] Vertex AI initialized. ` +
        `Project: ${projectId}, Location: ${location}`
      );
    } catch (err) {
      console.error(
        '[GeminiService] Vertex AI initialization failed. ' +
        'Falling back to AI Studio mode. Error:', err
      );
      this.useVertexAI = false;
    }
  }
  // === VVS VERTEX AI INIT END ===

  private static cachedProjectId: string | null = null;

  static async resolveProjectId(apiKey: string): Promise<string | null> {
    if (this.cachedProjectId) return this.cachedProjectId;
    if (!apiKey || !apiKey.startsWith('AQ.')) return null;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const res = await fetch(url);
      if (res.status === 403) {
        const text = await res.text();
        const match = text.match(/projects\/(\d+)/) || text.match(/project[ =](\d+)/);
        if (match && match[1]) {
          this.cachedProjectId = match[1];
          return this.cachedProjectId;
        }
      }
    } catch (err) {
      console.error('[GeminiService] Error probing project ID for AQ. key:', err);
    }
    return null;
  }

  constructor(apiKey?: string) {
    let key = apiKey;
    if (!key) {
      try {
        const settings = SettingsRepository.getSettings();
        key = settings.geminiApiKey || settings.apiKey;
      } catch (err) {
        console.error('[GeminiService] Error looking up settings for API key:', err);
      }
    }

    if (!key) {
      console.error('[GeminiService] API Key is missing or invalid.');
      throw new Error('Gemini API key is required. Set it in Settings.');
    }
    this.apiKey = key;
    this.genAI = GeminiService.getClient(key);
  }

  // ─── generateJSON ────────────────────────────────────────────────────────────
  /**
   * Calls Gemini, streams back chunks, collects into full text, strips markdown
   * fences, JSON-parses, Zod-validates, and retries up to `maxRetries` times on
   * parse / validation failures before throwing.
   */
  async generateJSON<T>(
    modelName: string,
    prompt: string,
    zodSchema: z.ZodType<T>,
    config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number; timeoutMs?: number },
    maxRetries = 3,
    onChunk?: (chunk: string) => void,
    explicitApiKey?: string,
  ): Promise<GenerateJSONResult<T>> {
    const activeApiKey = explicitApiKey || this.apiKey;
    const activeGenAI = GeminiService.getClient(activeApiKey);
    const projectId = await GeminiService.resolveProjectId(activeApiKey);
    const requestOptions = projectId ? {
      baseUrl: 'https://aiplatform.googleapis.com',
      apiVersion: `v1/projects/${projectId}/locations/global/publishers/google`
    } : undefined;

    const model = activeGenAI.getGenerativeModel({ model: modelName }, requestOptions);
    let currentPrompt = prompt;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let rawText = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        let thinkingTokens = 0;
        let totalTokens = 0;

        if (this.useVertexAI) {
          try {
            if (!this.vertexClient) {
              throw new Error('[GeminiService] Vertex AI client not initialized.');
            }
            const mappedModelName = this.mapModelNameForVertexAI(modelName);
            const timeoutMs = config?.timeoutMs ?? 20000;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
              controller.abort();
            }, timeoutMs);

            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                const err = new Error(`Vertex AI request timed out after ${timeoutMs / 1000} seconds`);
                (err as any).isTimeout = true;
                reject(err);
              }, timeoutMs);
            });

            const requestPromise = (async () => {
              let vertexRawText = '';
              let vertexInputTokens = 0;
              let vertexOutputTokens = 0;
              let vertexCachedTokens = 0;
              let vertexThinkingTokens = 0;
              let vertexTotalTokens = 0;

              const responseStream = await this.vertexClient!.models.generateContentStream({
                model: mappedModelName,
                contents: currentPrompt,
                config: {
                  temperature: config?.temperature ?? 0.7,
                  maxOutputTokens: config?.maxOutputTokens ?? 16384,
                  topP: config?.topP,
                  topK: config?.topK,
                  safetySettings: VERTEX_SAFETY_SETTINGS,
                  abortSignal: controller.signal,
                  thinkingConfig: mappedModelName.includes('pro') ? { thinkingBudget: 256 } : { thinkingBudget: 0 },
                }
              });

              for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                  vertexRawText += text;
                  onChunk?.(text);
                }
                if (chunk.usageMetadata) {
                  vertexInputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
                  vertexOutputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
                  vertexCachedTokens = (chunk.usageMetadata as any).cachedContentTokenCount ?? 0;
                  vertexThinkingTokens = (chunk.usageMetadata as any).thoughtsTokenCount ?? 0;
                  vertexTotalTokens = chunk.usageMetadata.totalTokenCount ?? 0;
                }
              }

              return {
                rawText: vertexRawText,
                inputTokens: vertexInputTokens,
                outputTokens: vertexOutputTokens,
                cachedTokens: vertexCachedTokens,
                thinkingTokens: vertexThinkingTokens,
                totalTokens: vertexTotalTokens,
              };
            })();

            const result = await Promise.race([
              requestPromise,
              timeoutPromise
            ]);
            clearTimeout(timeoutId);

            rawText = result.rawText;
            inputTokens = result.inputTokens;
            outputTokens = result.outputTokens;
            cachedTokens = result.cachedTokens;
            thinkingTokens = result.thinkingTokens;
            totalTokens = result.totalTokens;
          } catch (vertexError) {
            throw this.classifyAndWrapVertexError(vertexError, modelName);
          }
        } else {
          const streamResult = await this._callWithBackoff(() =>
            model.generateContentStream({
              contents: [{ role: 'user', parts: [{ text: currentPrompt }] }],
              generationConfig: {
                temperature:     config?.temperature     ?? 0.7,
                maxOutputTokens: config?.maxOutputTokens ?? 16384,
                topP:            config?.topP,
                topK:            config?.topK,
              },
            })
          );

          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            rawText += text;
            onChunk?.(text);
          }

          const response = await streamResult.response;
          inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
          outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
          cachedTokens = (response.usageMetadata as any)?.cachedContentTokenCount ?? 0;
          thinkingTokens = (response.usageMetadata as any)?.thoughtsTokenCount ?? 0;
          totalTokens = response.usageMetadata?.totalTokenCount ?? 0;
        }

        // ── strip markdown code fences if present ─────────────────────────────
        let clean = rawText.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        else if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        clean = clean.trim();

        // ── parse + validate ──────────────────────────────────────────────────
        try {
          const raw = JSON.parse(clean);

          // Log first 500 chars so we can see what the model actually returned
          console.info(`[GeminiService] Raw JSON (first 500): ${clean.slice(0, 500)}`);

          // Build list of candidates to try against the schema:
          //   1. The raw object itself
          //   2. Every value of the top-level object (handles { "production_bible": {...} })
          //   3. Every value nested one level deeper (handles { "data": { "bible": {...} } })
          //   We also support extracting elements from JSON arrays if they are encountered.
          const candidates: unknown[] = [raw];
          if (raw && typeof raw === 'object') {
            if (Array.isArray(raw)) {
              for (const item of raw) {
                if (item && typeof item === 'object') candidates.push(item);
              }
            } else {
              for (const v of Object.values(raw as Record<string, unknown>)) {
                if (v && typeof v === 'object') {
                  if (Array.isArray(v)) {
                    for (const item of v) {
                      if (item && typeof item === 'object') candidates.push(item);
                    }
                  } else {
                    candidates.push(v);
                    for (const vv of Object.values(v as Record<string, unknown>)) {
                      if (vv && typeof vv === 'object') {
                        if (Array.isArray(vv)) {
                          for (const item of vv) {
                            if (item && typeof item === 'object') candidates.push(item);
                          }
                        } else {
                          candidates.push(vv);
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          let validated: T | undefined;
          let lastErr: unknown;
          for (const candidate of candidates) {
            const result = zodSchema.safeParse(candidate);
            if (result.success) {
              validated = result.data;
              break;
            }
            lastErr = result.error;
          }

          if (validated !== undefined) {
            return {
              data: validated,
              inputTokens,
              outputTokens,
              rawResponseText: clean,
              cachedTokens,
              thinkingTokens,
              totalTokens,
            };
          }
          throw lastErr;

        } catch (parseErr: unknown) {
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          if (attempt >= maxRetries) {
            throw new Error(`Schema validation failed after ${maxRetries} attempts: ${errMsg}`);
          }
          // Self-healing: feed the error back to the model
          currentPrompt = `${prompt}

IMPORTANT: Your previous response failed JSON/schema validation.
Error: ${errMsg}
Bad response was:
${rawText.slice(0, 2000)}

Return ONLY valid JSON matching the schema. No markdown fences. No explanation.`;
          console.warn(`[GeminiService] Attempt ${attempt} validation failed — retrying.`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt >= maxRetries || (err && (err as any).failFast) || msg.includes('timed out')) {
          throw err;
        }
        console.warn(`[GeminiService] Attempt ${attempt} API error — retrying.`);
      }
    }

    throw new Error('Max retries exceeded in GeminiService.generateJSON');
  }

  // ─── generateStream ──────────────────────────────────────────────────────────
  /**
   * Streams plain text from Gemini. Used for progress display, not JSON parsing.
   */
  async generateStream(
    modelName: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (err: unknown) => void,
    config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number; timeoutMs?: number },
    explicitApiKey?: string,
    onUsage?: (usage: TokenUsage) => void,
  ): Promise<void> {
    // === VVS VERTEX AI ROUTING START ===
    if (this.useVertexAI) {
      const timeoutMs = config?.timeoutMs ?? 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let completed = false;

      const runStream = async () => {
        try {
          let full = '';
          for await (const chunk of this.generateStreamViaVertexAI(
            modelName,
            prompt,
            undefined,
            config,
            controller.signal,
            onUsage
          )) {
            full += chunk;
            onChunk(chunk);
          }
          completed = true;
          onComplete(full);
        } catch (vertexError) {
          completed = true;
          const classified = this.classifyAndWrapVertexError(vertexError, modelName);
          onError(classified);
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          if (!completed) {
            controller.abort();
            const err = new Error(`Vertex AI request timed out after ${timeoutMs / 1000} seconds`);
            (err as any).isTimeout = true;
            reject(err);
          }
        }, timeoutMs);
      });

      Promise.race([
        runStream(),
        timeoutPromise
      ]).catch((err) => {
        const classified = this.classifyAndWrapVertexError(err, modelName);
        onError(classified);
      });
      return;
    }
    // === VVS VERTEX AI ROUTING END ===

    try {
      const activeApiKey = explicitApiKey || this.apiKey;
      const activeGenAI = GeminiService.getClient(activeApiKey);
      const projectId = await GeminiService.resolveProjectId(activeApiKey);
      const requestOptions = projectId ? {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: `v1/projects/${projectId}/locations/global/publishers/google`
      } : undefined;

      const model  = activeGenAI.getGenerativeModel({ model: modelName }, requestOptions);
      const result = await this._callWithBackoff(() =>
        model.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:     config?.temperature     ?? 0.8,
            maxOutputTokens: config?.maxOutputTokens ?? 8192,
            topP:            config?.topP,
            topK:            config?.topK,
          },
        })
      );

      let full = '';
      for await (const chunk of result.stream) {
        const text = chunk.text();
        full += text;
        onChunk(text);
      }

      try {
        const response = await result.response;
        if (response && response.usageMetadata && onUsage) {
          onUsage({
            promptTokenCount: response.usageMetadata.promptTokenCount ?? 0,
            candidatesTokenCount: response.usageMetadata.candidatesTokenCount ?? 0,
            cachedContentTokenCount: (response.usageMetadata as any).cachedContentTokenCount ?? 0,
            thoughtsTokenCount: (response.usageMetadata as any).thoughtsTokenCount ?? 0,
            totalTokenCount: response.usageMetadata.totalTokenCount ?? 0,
          });
        }
      } catch (usageErr) {
        console.warn('[GeminiService] Failed to retrieve usageMetadata for stream:', usageErr);
      }

      onComplete(full);
    } catch (err) {
      onError(err);
    }
  }

  // === VVS FIX-1A START ===
  private mapModelNameForVertexAI(modelName: string): string {
    // Pass the modelName parameter exactly as-is to the SDK
    return modelName;
  }
  // === VVS FIX-1A END ===

  // === VVS VERTEX AI STREAM METHOD START ===
  private async *generateStreamViaVertexAI(
    modelName: string,
    prompt: string,
    systemInstruction?: string,
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
      timeoutMs?: number;
    },
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void,
  ): AsyncGenerator<string, void, unknown> {
    if (!this.vertexClient || !this.useVertexAI) {
      throw new Error('[GeminiService] Vertex AI not initialized. Using AI Studio.');
    }

    const mappedModelName = this.mapModelNameForVertexAI(modelName);
    const timeoutMs = generationConfig?.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    try {
      const responseStream = await this.vertexClient.models.generateContentStream({
        model: mappedModelName,
        contents: prompt,
        config: {
          temperature: generationConfig?.temperature ?? 1.0,
          maxOutputTokens: generationConfig?.maxOutputTokens ?? 8192,
          topP: generationConfig?.topP,
          topK: generationConfig?.topK,
          safetySettings: VERTEX_SAFETY_SETTINGS,
          systemInstruction: systemInstruction,
          abortSignal: controller.signal,
          thinkingConfig: mappedModelName.includes('pro') ? { thinkingBudget: 256 } : { thinkingBudget: 0 },
        }
      });

      let lastUsage: TokenUsage | undefined;
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          yield text;
        }
        if (chunk.usageMetadata) {
          lastUsage = {
            promptTokenCount: chunk.usageMetadata.promptTokenCount ?? 0,
            candidatesTokenCount: chunk.usageMetadata.candidatesTokenCount ?? 0,
            cachedContentTokenCount: (chunk.usageMetadata as any).cachedContentTokenCount ?? 0,
            thoughtsTokenCount: (chunk.usageMetadata as any).thoughtsTokenCount ?? 0,
            totalTokenCount: chunk.usageMetadata.totalTokenCount ?? 0,
          };
        }
      }
      if (lastUsage && onUsage) {
        onUsage(lastUsage);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  // === VVS VERTEX AI STREAM METHOD END ===

  // === VVS VERTEX AI GENERATE METHOD START ===
  private async generateViaVertexAI(
    modelName: string,
    prompt: string,
    systemInstruction?: string,
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
      timeoutMs?: number;
    }
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  }> {
    if (!this.vertexClient || !this.useVertexAI) {
      throw new Error('[GeminiService] Vertex AI not initialized. Using AI Studio.');
    }

    const mappedModelName = this.mapModelNameForVertexAI(modelName);
    const timeoutMs = generationConfig?.timeoutMs ?? 20000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await Promise.race([
        this.vertexClient.models.generateContent({
          model: mappedModelName,
          contents: prompt,
          config: {
            temperature: generationConfig?.temperature ?? 1.0,
            maxOutputTokens: generationConfig?.maxOutputTokens ?? 8192,
            topP: generationConfig?.topP,
            topK: generationConfig?.topK,
            safetySettings: VERTEX_SAFETY_SETTINGS,
            systemInstruction: systemInstruction,
            abortSignal: controller.signal,
            thinkingConfig: mappedModelName.includes('pro') ? { thinkingBudget: 256 } : { thinkingBudget: 0 },
          }
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            const err = new Error(`Vertex AI request timed out after ${timeoutMs / 1000} seconds`);
            (err as any).isTimeout = true;
            reject(err);
          }, timeoutMs);
        })
      ]);

      clearTimeout(timeoutId);

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
        const error = new Error(
          `Text not available. Response was blocked due to PROHIBITED_CONTENT.`
        );
        (error as any).errorType = 'PROHIBITED_CONTENT';
        throw error;
      }

      const text = response.text || '';
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const cachedTokens = (response.usageMetadata as any)?.cachedContentTokenCount ?? 0;
      const thinkingTokens = (response.usageMetadata as any)?.thoughtsTokenCount ?? 0;
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0;

      return { text, inputTokens, outputTokens, cachedTokens, thinkingTokens, totalTokens };
    } catch (err) {
      clearTimeout(timeoutId);
      controller.abort();
      throw this.classifyAndWrapVertexError(err, modelName);
    }
  }
  // === VVS VERTEX AI GENERATE METHOD END ===

  private classifyAndWrapVertexError(err: unknown, modelName?: string): Error {
    const msg = err instanceof Error ? err.message : String(err);
    const msgLower = msg.toLowerCase();

    if (
      msg.includes('403') ||
      msg.includes('PERMISSION_DENIED') ||
      msgLower.includes('denied access') ||
      (msgLower.includes('project') && msgLower.includes('disabled')) ||
      msgLower.includes('billing') ||
      msgLower.includes('account') ||
      msgLower.includes('unauthorized') ||
      msgLower.includes('credentials')
    ) {
      const rejectErr = new Error(
        `Vertex project rejected — check GCP project ID + billing + Vertex AI API enabled. Details: ${msg}`
      );
      (rejectErr as any).failFast = true;
      return rejectErr;
    }

    if (msgLower.includes('not_found') || msgLower.includes('404') || msgLower.includes('model not found') || msgLower.includes('no access') || msgLower.includes('not found')) {
      const settings = SettingsRepository.getSettings() as any;
      const gcpLocation = settings.gcpLocation || settings.gcp_location || 'us-central1';
      console.error(`[GeminiService] model ${modelName || 'unknown'} not available in region ${gcpLocation}. (We recommend us-central1 for the broadest model availability)`);
    }

    if (err && (err as any).isTimeout) {
      const timeoutErr = new Error(`aborted by our timeout: ${msg}`);
      (timeoutErr as any).isTimeout = true;
      return timeoutErr;
    }

    if (msgLower.includes('aborted') || msgLower.includes('abort')) {
      const timeoutErr = new Error(`aborted by our timeout: Request was aborted (possibly due to timeout)`);
      (timeoutErr as any).isTimeout = true;
      return timeoutErr;
    }

    return err instanceof Error ? err : new Error(msg);
  }

  // ─── private: call with backoff ───────────────────────────────────────────────
  //
  // Distinguishes two 429 flavours:
  //   • Daily quota exhausted  ("limit: 0")  → throw immediately, retrying won't help
  //   • Per-minute rate limit  ("Please retry in Xs") → backoff and retry
  private async _callWithBackoff<R>(fn: () => Promise<R>): Promise<R> {
    const MAX_ATTEMPTS = 2; // Keep at most 1 retry (2 total attempts) ONLY for transient errors
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const msgLower = msg.toLowerCase();
        
        const isDeadKey = msg.includes('401') || msg.includes('403') ||
                          msgLower.includes('api_key_invalid') ||
                          msgLower.includes('api key not valid') ||
                          msgLower.includes('please pass a valid api key') ||
                          msgLower.includes('account_state_invalid') ||
                          msgLower.includes('permission_denied') ||
                          msgLower.includes('service account is deleted or disabled') ||
                          msgLower.includes('denied access');

        const isQuota = msg.includes('429') || 
                        msg.includes('RESOURCE_EXHAUSTED') || 
                        msgLower.includes('quota') || 
                        msgLower.includes('rate limit') || 
                        msgLower.includes('exhausted');

        if (isDeadKey || isQuota) {
          // Do NOT retry or sleep. Throw immediately so the pool rotates.
          throw err;
        }

        const isTransient = msg.includes('503') || 
                            msgLower.includes('service unavailable') || 
                            msgLower.includes('timeout') || 
                            msgLower.includes('network') ||
                            msgLower.includes('fetch failed');

        if (isTransient && i < MAX_ATTEMPTS - 1) {
          console.warn(`[GeminiService] Transient error — retrying once in 1000ms (attempt ${i + 1}/${MAX_ATTEMPTS}): ${msg.slice(0, 150)}`);
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          throw err;
        }
      }
    }
    throw new Error('[GeminiService] _callWithBackoff: max retries exceeded');
  }

  static async getAvailableModels(apiKey: string): Promise<string[]> {
    if (!GeminiService.hasLoggedAvailableModels) {
      console.log('=== GET AVAILABLE MODELS CALLED ===');
      GeminiService.hasLoggedAvailableModels = true;
    }
    if (!apiKey) {
      throw new Error('API key is required to fetch available models.');
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Google API returned status ${res.status}`);
      }
      const data = await res.json() as { models?: Array<{ name: string; supportedGenerationMethods: string[] }> };
      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response layout');
      }
      const models = data.models
        .filter(m => m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
      if (models.length === 0) {
        throw new Error('No generateContent models found');
      }
      return models;
    } catch (err) {
      console.warn('[GeminiService] Failed to fetch available models dynamically, using static fallback list.');
      return [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash-001',
        'gemini-2.5-flash-lite'
      ];
    }
  }

  static async testModel(apiKey: string, modelName: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const projectId = await GeminiService.resolveProjectId(apiKey);
      const requestOptions = projectId ? {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: `v1/projects/${projectId}/locations/global/publishers/google`
      } : undefined;

      const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: "Say 'OK'" }] }],
        generationConfig: {
          maxOutputTokens: 5,
          temperature: 0.1,
        }
      });
      
      const response = await result.response;
      const text = response.text();
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        latency,
      };
    } catch (err: any) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async generateGroundedText(
    modelName: string,
    prompt: string,
    explicitApiKey?: string,
  ): Promise<{ text: string; sources: string[] } | null> {
    try {
      console.info(`[GeminiService] Attempting grounded search generation for prompt...`);
      const activeApiKey = explicitApiKey || this.apiKey;
      const activeGenAI = GeminiService.getClient(activeApiKey);
      const projectId = await GeminiService.resolveProjectId(activeApiKey);
      const requestOptions = projectId ? {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: `v1/projects/${projectId}/locations/global/publishers/google`
      } : undefined;

      let rawText = '';
      const sources: string[] = [];

      if (this.useVertexAI) {
        if (!this.vertexClient) {
          throw new Error('[GeminiService] Vertex AI client not initialized.');
        }
        const mappedModelName = this.mapModelNameForVertexAI(modelName);
        const response = await this.vertexClient.models.generateContent({
          model: mappedModelName,
          contents: prompt,
          config: {
            temperature: 0.2,
            maxOutputTokens: 2000,
            safetySettings: VERTEX_SAFETY_SETTINGS,
            tools: [{ googleSearch: {} }]
          }
        });

        rawText = response.text || '';
        const candidates = (response as any).candidates;
        if (candidates && candidates[0] && candidates[0].groundingMetadata) {
          const gm = candidates[0].groundingMetadata;
          if (gm.groundingChunks) {
            for (const chunk of gm.groundingChunks) {
              if (chunk.web && chunk.web.uri) {
                sources.push(chunk.web.uri);
              }
            }
          }
        }
      } else {
        const model = activeGenAI.getGenerativeModel({
          model: modelName,
          tools: [{ googleSearch: {} }]
        } as any, requestOptions);

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
          }
        });

        const response = await result.response;
        rawText = response.text() || '';

        const candidate = response.candidates?.[0] as any;
        if (candidate?.groundingMetadata) {
          const gm = candidate.groundingMetadata;
          if (gm.groundingChunks) {
            for (const chunk of gm.groundingChunks) {
              if (chunk.web?.uri) {
                sources.push(chunk.web.uri);
              }
            }
          }
        }
      }

      const uniqueSources = Array.from(new Set(sources));
      console.info(`[GeminiService] Grounded search finished. Sources found: ${uniqueSources.length}`);
      return {
        text: rawText,
        sources: uniqueSources
      };
    } catch (err: any) {
      console.warn(`[GeminiService] Grounded search failed (falling back to LLM knowledge):`, err.message || err);
      return null;
    }
  }
}

export function isVertexFailFastError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    if ((error as any).failFast === true) {
      return true;
    }
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Vertex project rejected');
}

