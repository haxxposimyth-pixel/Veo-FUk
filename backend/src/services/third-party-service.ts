import OpenAI from 'openai';
import { z } from 'zod';

interface GenerateJSONResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  rawResponseText: string;
}

export class ThirdPartyService {
  private openai: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    if (!apiKey) {
      throw new Error('Third-Party API key is required. Please set it in Settings.');
    }
    this.openai = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  // ─── generateJSON ────────────────────────────────────────────────────────────
  /**
   * Calls Third-Party API, streams back chunks, collects into full text, strips markdown
   * fences, JSON-parses, Zod-validates, and retries up to `maxRetries` times on
   * parse / validation failures before throwing.
   */
  async generateJSON<T>(
    modelName: string,
    prompt: string,
    zodSchema: z.ZodType<T>,
    config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number },
    maxRetries = 3,
    onChunk?: (chunk: string) => void,
  ): Promise<GenerateJSONResult<T>> {
    let currentPrompt = prompt;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const stream = await this.openai.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: currentPrompt }],
          temperature: config?.temperature ?? 0.7,
          max_tokens: config?.maxOutputTokens ?? 8192,
          top_p: config?.topP,
          stream: true,
        });

        let rawText = '';
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              rawText += text;
              onChunk?.(text);
            }
          }
        } catch (streamErr: any) {
          if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort')) {
            console.warn('[ThirdPartyService] Streaming connection aborted by client.');
            throw streamErr;
          }
          throw streamErr;
        }

        // Estimate token usage
        const inputTokens = Math.ceil(currentPrompt.length / 4);
        const outputTokens = Math.ceil(rawText.length / 4);

        // ── strip markdown code fences if present ─────────────────────────────
        let clean = rawText.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        else if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        clean = clean.trim();

        // ── parse + validate ──────────────────────────────────────────────────
        try {
          const raw = JSON.parse(clean);
          console.info(`[ThirdPartyService] Raw JSON (first 500): ${clean.slice(0, 500)}`);

          // Build list of candidates to try against the schema:
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
            return { data: validated, inputTokens, outputTokens, rawResponseText: clean };
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
          console.warn(`[ThirdPartyService] Attempt ${attempt} validation failed — retrying.`);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('abort')) {
          throw err;
        }
        if (err.status === 401 || err.status === 403 || err.message?.includes('401') || err.message?.includes('403')) {
          const originalMsg = err.message || String(err);
          throw new Error(`Third-Party API authentication failed. Check your API key. Original error: ${originalMsg}`);
        }
        if (err.status === 429 || err.message?.includes('429')) {
          const originalMsg = err.message || String(err);
          throw new Error(`Third-Party API rate limit exceeded. Please try again later. Original error: ${originalMsg}`);
        }
        if (err.status === 400 || err.status === 404 || err.message?.includes('400') || err.message?.includes('404')) {
          throw err;
        }
        if (attempt >= maxRetries) throw err;
        console.warn(`[ThirdPartyService] Attempt ${attempt} API error — retrying.`);
      }
    }

    throw new Error('Max retries exceeded in ThirdPartyService.generateJSON');
  }

  // ─── generateStream ──────────────────────────────────────────────────────────
  /**
   * Streams plain text from Third-Party API. Used for progress display.
   */
  async generateStream(
    modelName: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (err: unknown) => void,
    config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number },
  ): Promise<void> {
    try {
      const stream = await this.openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: config?.temperature ?? 0.8,
        max_tokens: config?.maxOutputTokens ?? 8192,
        top_p: config?.topP,
        stream: true,
      });

      let full = '';
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            full += text;
            onChunk(text);
          }
        }
        onComplete(full);
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort')) {
          console.warn('[ThirdPartyService] Streaming connection aborted by client.');
          return;
        }
        throw streamErr;
      }
    } catch (err: any) {
      if (err.status === 401 || err.status === 403 || err.message?.includes('401') || err.message?.includes('403')) {
        const originalMsg = err.message || String(err);
        onError(new Error(`Third-Party API authentication failed. Check your API key. Original error: ${originalMsg}`));
      } else if (err.status === 429 || err.message?.includes('429')) {
        const originalMsg = err.message || String(err);
        onError(new Error(`Third-Party API rate limit exceeded. Please try again later. Original error: ${originalMsg}`));
      } else {
        onError(err);
      }
    }
  }
}
