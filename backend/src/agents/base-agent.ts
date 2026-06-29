import db from '../db/connection';
import { LLMRouter } from '../services/llm-router';
import { z } from 'zod';
import crypto from 'crypto';
import { extractAndParseJSON } from '../utils/json-extractor';
import { StructuredOutputError } from '../utils/structured-output.error';
import { computeCost, TokenUsage } from '../config/model-pricing';

// === VVS OPT FIX-9 SCHEMA EXTRACTOR START ===
function extractSchemaSummary(originalPrompt: string): string {
  // Strategy: find the JSON schema block in the prompt
  // Most agents define the schema between markers like:
  // "Return a JSON object with these fields:" or "Output format:" or
  // "Respond with valid JSON:" or a code fence block showing the schema

  const schemaMarkers = [
    /required\s+json\s+(?:structure|schema)/i,
    /return\s+(?:a\s+)?(?:valid\s+)?json\s+(?:object|array)/i,
    /output\s+format:/i,
    /respond\s+with\s+(?:valid\s+)?json/i,
    /json\s+schema:/i,
    /expected\s+output:/i,
    /your\s+response\s+must\s+be/i,
  ];

  for (const marker of schemaMarkers) {
    const match = originalPrompt.search(marker);
    if (match !== -1) {
      // Return from the schema marker to the end of the prompt
      // Cap at 800 tokens worth of characters (~3200 chars)
      const schemaSection = originalPrompt.slice(match, match + 3200);
      return `[SCHEMA SECTION FROM ORIGINAL PROMPT]\n${schemaSection}`;
    }
  }

  // Fallback: if no marker found, return only the last 1500 characters
  // of the original prompt (likely contains the output instructions)
  const fallback = originalPrompt.slice(-1500);
  return `[END OF ORIGINAL PROMPT — CONTAINS OUTPUT INSTRUCTIONS]\n${fallback}`;
}
let cachedHasApiKeyIndex: boolean | null = null;
function writeAgentLog(logData: {
  id: string;
  project_id: string | null;
  agent_name: string;
  model_used: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  status: string;
  error_message: string | null;
  input_prompt: string;
  output_response: string | null;
  repair_attempts?: number;
  api_key_index: number | null;
  total_tokens?: number | null;
  cached_tokens?: number | null;
  thinking_tokens?: number | null;
  cost?: number | null;
  tokens_estimated?: number;
  billing_source?: string | null;
  phase_number?: number | null;
}) {
  if (cachedHasApiKeyIndex === null) {
    try {
      const info = db.prepare("PRAGMA table_info(agent_logs)").all() as any[];
      cachedHasApiKeyIndex = info.some((col: any) => col.name === 'api_key_index');
    } catch (e) {
      cachedHasApiKeyIndex = false;
    }
  }

  const columns = [
    'id', 'project_id', 'agent_name', 'model_used', 'input_tokens', 'output_tokens',
    'duration_ms', 'status', 'error_message', 'input_prompt', 'output_response',
    'total_tokens', 'cached_tokens', 'thinking_tokens', 'cost', 'tokens_estimated',
    'billing_source', 'phase_number'
  ];
  const values = [
    logData.id, logData.project_id, logData.agent_name, logData.model_used,
    logData.input_tokens, logData.output_tokens, logData.duration_ms, logData.status,
    logData.error_message, logData.input_prompt, logData.output_response,
    logData.total_tokens ?? null, logData.cached_tokens ?? null, logData.thinking_tokens ?? null,
    logData.cost ?? null, logData.tokens_estimated ?? 0, logData.billing_source ?? null,
    logData.phase_number ?? null
  ];

  if (logData.repair_attempts !== undefined) {
    columns.push('repair_attempts');
    values.push(logData.repair_attempts);
  }

  if (cachedHasApiKeyIndex && logData.api_key_index !== undefined) {
    columns.push('api_key_index');
    values.push(logData.api_key_index);
  }

  const placeholders = new Array(columns.length).fill('?').join(', ');
  const sql = `
    INSERT INTO agent_logs (${columns.join(', ')})
    VALUES (${placeholders})
  `;
  db.prepare(sql).run(...values);
}

export abstract class BaseAgent {
  protected readonly agentName: string;
  protected readonly defaultModel = 'gemini-2.5-flash-lite';

  constructor(agentName: string) {
    this.agentName = agentName;
    if (this.constructor.name === 'VeoAgent') {
      (this as any).generateStructured = BaseAgent.prototype.generateStructured.bind(this);
    }
  }

  /**
   * Universal structured-output guard.
   * Runs the LLM raw streaming generation, extracts and parses the JSON,
   * validates against Zod, and self-heals up to maxRepairAttempts times.
   */
  protected async generateStructured<T>(
    projectId: string | null,
    apiKey: string | undefined,
    modelName: string | undefined,
    params: {
      prompt: string;
      schema: z.ZodType<T, any, any>;
      systemInstruction?: string;
      maxRepairAttempts?: number;
      temperature?: number;
      maxOutputTokens?: number;
      sanitizedPrompt?: string;
      phaseNumber?: number;
    },
    onChunk?: (chunk: string) => void,
    agentNameOverride?: string,
  ): Promise<T> {
    const agentName = agentNameOverride ?? this.agentName ?? this.constructor.name;
    const model = modelName ?? this.defaultModel;
    let actualModel = model;
    const startTime = Date.now();
    const logId = crypto.randomUUID();

    let fullPrompt = params.systemInstruction 
      ? `${params.systemInstruction}\n\n${params.prompt}` 
      : params.prompt;
    const originalPrompt = fullPrompt;

    let repairAttemptsCount = 0;
    const maxAttempts = params.maxRepairAttempts ?? 2; // Default is 2 attempts (1 original + 1 repair)

    let rawResponseText = '';
    let parsedData: any = null;
    let lastError: any = null;
    let apiKeyIndex: number | null = null;
    let routerResult: { usage?: TokenUsage; billing_source: 'vertex' | 'ai_studio' } | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      rawResponseText = '';
      let streamError: any = null;
      try {
        routerResult = await LLMRouter.generateStream(
          agentName,
          fullPrompt,
          (chunk) => {
            rawResponseText += chunk;
            onChunk?.(chunk);
          },
          () => {},
          (err) => { streamError = err; },
          {
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
            apiKey,
            modelName: model,
            onModelChosen: (m) => { actualModel = m; },
            onApiKeyIndexChosen: (idx) => { apiKeyIndex = idx; },
          },
          (params as any).sanitizedPrompt
        );
      } catch (err) {
        streamError = err;
      }

      if (streamError) {
        const durationMs = Date.now() - startTime;
        const inputTokens = Math.ceil(originalPrompt.length / 4);
        const errorMsg = streamError instanceof Error ? streamError.message : String(streamError);
        
        const dummyUsage = {
          promptTokenCount: inputTokens,
          candidatesTokenCount: 0,
          cachedContentTokenCount: 0,
          thoughtsTokenCount: 0,
          totalTokenCount: inputTokens
        };
        const billingSource = routerResult?.billing_source ?? 'ai_studio';
        const cost = computeCost(actualModel, dummyUsage, billingSource);

        writeAgentLog({
          id: logId,
          project_id: projectId,
          agent_name: agentName,
          model_used: actualModel,
          input_tokens: inputTokens,
          output_tokens: null,
          duration_ms: durationMs,
          status: 'failed',
          error_message: errorMsg,
          input_prompt: originalPrompt,
          output_response: null,
          repair_attempts: repairAttemptsCount,
          api_key_index: apiKeyIndex,
          total_tokens: inputTokens,
          cached_tokens: 0,
          thinking_tokens: 0,
          cost,
          tokens_estimated: 1,
          billing_source: billingSource,
          phase_number: params.phaseNumber ?? null
        });

        throw streamError;
      }

      try {
        // Extract and parse
        parsedData = extractAndParseJSON(rawResponseText);
        
        // Zod validation
        const validationResult = params.schema.safeParse(parsedData);
        if (validationResult.success) {
          const durationMs = Date.now() - startTime;
          let inputTokens = Math.ceil(originalPrompt.length / 4);
          let outputTokens = Math.ceil(rawResponseText.length / 4);
          let cachedTokens = 0;
          let thinkingTokens = 0;
          let totalTokens = inputTokens + outputTokens;
          let tokens_estimated = 1;

          if (routerResult?.usage) {
            inputTokens = routerResult.usage.promptTokenCount;
            outputTokens = routerResult.usage.candidatesTokenCount;
            cachedTokens = routerResult.usage.cachedContentTokenCount;
            thinkingTokens = routerResult.usage.thoughtsTokenCount;
            totalTokens = routerResult.usage.totalTokenCount;
            tokens_estimated = 0;
          }

          const billingSource = routerResult?.billing_source ?? 'ai_studio';
          const usage: TokenUsage = {
            promptTokenCount: inputTokens,
            candidatesTokenCount: outputTokens,
            cachedContentTokenCount: cachedTokens,
            thoughtsTokenCount: thinkingTokens,
            totalTokenCount: totalTokens
          };
          const cost = computeCost(actualModel, usage, billingSource);

          // Save log with success status and repair attempts count
          writeAgentLog({
            id: logId,
            project_id: projectId,
            agent_name: agentName,
            model_used: actualModel,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            duration_ms: durationMs,
            status: 'success',
            error_message: null,
            input_prompt: originalPrompt,
            output_response: rawResponseText,
            repair_attempts: repairAttemptsCount,
            api_key_index: apiKeyIndex,
            total_tokens: totalTokens,
            cached_tokens: cachedTokens,
            thinking_tokens: thinkingTokens,
            cost,
            tokens_estimated,
            billing_source: billingSource,
            phase_number: params.phaseNumber ?? null
          });

          return validationResult.data;
        } else {
          throw validationResult.error;
        }

      } catch (err: any) {
        lastError = err;
        
        const isRootExpectedObjectArray = err instanceof z.ZodError && err.errors.some(e => e.path.length === 0 && e.code === 'invalid_type' && e.expected === 'object' && e.received === 'array');

        if (attempt < maxAttempts && !isRootExpectedObjectArray) {
          repairAttemptsCount++;
          
          const zodErrorsText = err instanceof z.ZodError
            ? err.errors.map(e => `- Field "${e.path.join('.')}": ${e.message}`).join('\n')
            : err instanceof Error ? err.message : String(err);

          // === VVS OPT FIX-9 REPAIR PROMPT START ===
          const schemaSummary = extractSchemaSummary(originalPrompt);

          // Cap the failed raw output at 12000 characters to prevent huge repair prompts
          const truncatedFailedOutput = rawResponseText.length > 12000
            ? rawResponseText.slice(0, 12000) + '\n...[truncated — full response was longer]'
            : rawResponseText;

          const repairPrompt = [
            'Your previous response failed validation. Fix the JSON and return ONLY the corrected JSON.',
            '',
            '=== EXPECTED OUTPUT FORMAT ===',
            schemaSummary,
            '',
            '=== YOUR FAILED RESPONSE ===',
            truncatedFailedOutput,
            '',
            '=== VALIDATION ERRORS TO FIX ===',
            zodErrorsText, // the Zod error messages — keep these unchanged
            '',
            'Return ONLY the corrected JSON. No explanation. No markdown fences.',
          ].join('\n');

          fullPrompt = repairPrompt;
          // === VVS OPT FIX-9 REPAIR PROMPT END ===

          // === VVS OPT FIX-9 ASSERTION START ===
          if (process.env.NODE_ENV === 'development') {
            const originalTokenEstimate = Math.ceil(originalPrompt.length / 4);
            const repairTokenEstimate = Math.ceil(repairPrompt.length / 4);
            if (repairTokenEstimate > originalTokenEstimate) {
              console.warn(
                `[BaseAgent] WARNING: repair prompt (${repairTokenEstimate} est. tokens) ` +
                `is LARGER than original (${originalTokenEstimate} est. tokens). ` +
                `Check extractSchemaSummary for agent: ${agentName}`
              );
            }
          }
          // === VVS OPT FIX-9 ASSERTION END ===
          
          console.warn(`[BaseAgent] ${agentName} JSON validation failed on attempt ${attempt}. Retrying with repair prompt. Error: ${zodErrorsText}`);
        } else if (isRootExpectedObjectArray) {
          throw err;
        }
      }
    }

    // If we reached here, both attempts failed.
    const durationMs = Date.now() - startTime;
    let inputTokens = Math.ceil(originalPrompt.length / 4);
    let outputTokens = Math.ceil(rawResponseText.length / 4);
    let cachedTokens = 0;
    let thinkingTokens = 0;
    let totalTokens = inputTokens + outputTokens;
    let tokens_estimated = 1;

    if (routerResult?.usage) {
      inputTokens = routerResult.usage.promptTokenCount;
      outputTokens = routerResult.usage.candidatesTokenCount;
      cachedTokens = routerResult.usage.cachedContentTokenCount;
      thinkingTokens = routerResult.usage.thoughtsTokenCount;
      totalTokens = routerResult.usage.totalTokenCount;
      tokens_estimated = 0;
    }
    const billingSource = routerResult?.billing_source ?? 'ai_studio';
    const usage = {
      promptTokenCount: inputTokens,
      candidatesTokenCount: outputTokens,
      cachedContentTokenCount: cachedTokens,
      thoughtsTokenCount: thinkingTokens,
      totalTokenCount: totalTokens
    };
    const cost = computeCost(actualModel, usage, billingSource);

    const zodIssues = lastError instanceof z.ZodError ? lastError.errors : [];
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);

    writeAgentLog({
      id: logId,
      project_id: projectId,
      agent_name: agentName,
      model_used: actualModel,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      status: 'failed',
      error_message: errorMsg,
      input_prompt: originalPrompt,
      output_response: rawResponseText,
      repair_attempts: repairAttemptsCount,
      api_key_index: apiKeyIndex,
      total_tokens: totalTokens,
      cached_tokens: cachedTokens,
      thinking_tokens: thinkingTokens,
      cost,
      tokens_estimated,
      billing_source: billingSource,
      phase_number: params.phaseNumber ?? null
    });

    throw new StructuredOutputError({
      agentName: agentName,
      attemptCount: maxAttempts,
      zodIssues,
      rawOutput: rawResponseText,
      message: `Schema validation failed after ${maxAttempts} attempts for agent ${agentName}: ${errorMsg}`
    });
  }

  /**
   * Core execution wrapper:
   *   1. Calls LLMRouter.generateJSON
   *   2. Logs result (tokens, duration, status) to agent_logs table
   *   3. Re-throws on failure so the route can handle the error
   */
  protected async executeAgentCall<T>(
    projectId: string | null,
    apiKey: string,
    modelName: string | undefined,
    prompt: string,
    zodSchema: z.ZodType<T, any, any>,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
  ): Promise<T> {
    const model     = modelName ?? this.defaultModel;
    let actualModel = model;
    const logId     = crypto.randomUUID();
    const startTime = Date.now();
    let apiKeyIndex: number | null = null;

    try {
      const result  = await LLMRouter.generateJSON<T>(
        this.agentName,
        prompt,
        zodSchema,
        {
          temperature: config?.temperature,
          maxOutputTokens: config?.maxOutputTokens,
          apiKey,
          modelName: model,
          onModelChosen: (m) => { actualModel = m; },
          onApiKeyIndexChosen: (idx) => { apiKeyIndex = idx; },
        },
        onChunk,
      );

      const usage: TokenUsage = {
        promptTokenCount: result.inputTokens,
        candidatesTokenCount: result.outputTokens,
        cachedContentTokenCount: result.cachedTokens ?? 0,
        thoughtsTokenCount: result.thinkingTokens ?? 0,
        totalTokenCount: result.totalTokens ?? (result.inputTokens + result.outputTokens),
      };
      const cost = computeCost(actualModel, usage, result.billing_source);
      const durationMs = Date.now() - startTime;

      writeAgentLog({
        id: logId,
        project_id: projectId,
        agent_name: this.agentName,
        model_used: actualModel,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        duration_ms: durationMs,
        status: 'success',
        error_message: null,
        input_prompt: prompt,
        output_response: result.rawResponseText,
        api_key_index: apiKeyIndex,
        total_tokens: usage.totalTokenCount,
        cached_tokens: usage.cachedContentTokenCount,
        thinking_tokens: usage.thoughtsTokenCount,
        cost,
        tokens_estimated: 0,
        billing_source: result.billing_source,
        phase_number: null
      });

      return result.data;

    } catch (err: unknown) {
      const durationMs  = Date.now() - startTime;
      const errorMsg    = err instanceof Error ? err.message : 'Unknown error';

      const inputTokens = Math.ceil(prompt.length / 4);
      const dummyUsage = {
        promptTokenCount: inputTokens,
        candidatesTokenCount: 0,
        cachedContentTokenCount: 0,
        thoughtsTokenCount: 0,
        totalTokenCount: inputTokens
      };
      const settings = require('../db/repositories/settings.repo').SettingsRepository.getSettings();
      const billingSource = (settings.vertexEnabled && settings.gcpProjectId) ? 'vertex' : 'ai_studio';
      const cost = computeCost(actualModel, dummyUsage, billingSource);

      writeAgentLog({
        id: logId,
        project_id: projectId,
        agent_name: this.agentName,
        model_used: actualModel,
        input_tokens: null,
        output_tokens: null,
        duration_ms: durationMs,
        status: 'failed',
        error_message: errorMsg,
        input_prompt: prompt,
        output_response: null,
        api_key_index: apiKeyIndex,
        total_tokens: inputTokens,
        cached_tokens: 0,
        thinking_tokens: 0,
        cost,
        tokens_estimated: 1,
        billing_source: billingSource,
        phase_number: null
      });

      throw err;
    }
  }

  /**
   * Helper to execute a raw streaming text call (non-JSON, plain text)
   * and log input/output to the agent_logs database.
   */
  protected async executeRawCall(
    projectId: string | null,
    apiKey: string | undefined,
    modelName: string | undefined,
    prompt: string,
    agentNameOverride: string,
    config?: { temperature?: number; maxOutputTokens?: number; phaseNumber?: number },
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const model     = modelName ?? this.defaultModel;
    let actualModel = model;
    const logId     = crypto.randomUUID();
    const startTime = Date.now();
    let apiKeyIndex: number | null = null;

    try {
      let outputText = '';
      
      const routerResult = await LLMRouter.generateStream(
        agentNameOverride,
        prompt,
        (chunk) => {
          outputText += chunk;
          onChunk?.(chunk);
        },
        () => {},
        (err) => { throw err; },
        {
          temperature: config?.temperature,
          maxOutputTokens: config?.maxOutputTokens,
          apiKey,
          modelName: model,
          onModelChosen: (m) => { actualModel = m; },
          onApiKeyIndexChosen: (idx) => { apiKeyIndex = idx; },
        }
      );

      const durationMs = Date.now() - startTime;

      let inputTokens = Math.ceil(prompt.length / 4);
      let outputTokens = Math.ceil(outputText.length / 4);
      let cachedTokens = 0;
      let thinkingTokens = 0;
      let totalTokens = inputTokens + outputTokens;
      let tokens_estimated = 1;

      if (routerResult?.usage) {
        inputTokens = routerResult.usage.promptTokenCount;
        outputTokens = routerResult.usage.candidatesTokenCount;
        cachedTokens = routerResult.usage.cachedContentTokenCount;
        thinkingTokens = routerResult.usage.thoughtsTokenCount;
        totalTokens = routerResult.usage.totalTokenCount;
        tokens_estimated = 0;
      }

      const billingSource = routerResult?.billing_source ?? 'ai_studio';
      const usage: TokenUsage = {
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        cachedContentTokenCount: cachedTokens,
        thoughtsTokenCount: thinkingTokens,
        totalTokenCount: totalTokens
      };
      const cost = computeCost(actualModel, usage, billingSource);

      writeAgentLog({
        id: logId,
        project_id: projectId,
        agent_name: agentNameOverride,
        model_used: actualModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        duration_ms: durationMs,
        status: 'success',
        error_message: null,
        input_prompt: prompt,
        output_response: outputText,
        api_key_index: apiKeyIndex,
        total_tokens: totalTokens,
        cached_tokens: cachedTokens,
        thinking_tokens: thinkingTokens,
        cost,
        tokens_estimated,
        billing_source: billingSource,
        phase_number: config?.phaseNumber ?? null
      });

      return outputText;

    } catch (err: unknown) {
      const durationMs  = Date.now() - startTime;
      const errorMsg    = err instanceof Error ? err.message : 'Unknown error';

      const inputTokens = Math.ceil(prompt.length / 4);
      const dummyUsage = {
        promptTokenCount: inputTokens,
        candidatesTokenCount: 0,
        cachedContentTokenCount: 0,
        thoughtsTokenCount: 0,
        totalTokenCount: inputTokens
      };
      const settings = require('../db/repositories/settings.repo').SettingsRepository.getSettings();
      const billingSource = (settings.vertexEnabled && settings.gcpProjectId) ? 'vertex' : 'ai_studio';
      const cost = computeCost(actualModel, dummyUsage, billingSource);

      writeAgentLog({
        id: logId,
        project_id: projectId,
        agent_name: agentNameOverride,
        model_used: actualModel,
        input_tokens: null,
        output_tokens: null,
        duration_ms: durationMs,
        status: 'failed',
        error_message: errorMsg,
        input_prompt: prompt,
        output_response: null,
        api_key_index: apiKeyIndex,
        total_tokens: inputTokens,
        cached_tokens: 0,
        thinking_tokens: 0,
        cost,
        tokens_estimated: 1,
        billing_source: billingSource,
        phase_number: config?.phaseNumber ?? null
      });

      throw err;
    }
  }
}
