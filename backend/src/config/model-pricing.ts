export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

// Vertex AI Gemini pricing per 1 million tokens (in USD)
// Update these rates as Google Cloud updates pricing.
// Region: us-central1 (default)
export const MODEL_PRICING: Record<
  string,
  {
    inputRate: number;       // USD per 1M standard input tokens
    outputRate: number;      // USD per 1M output tokens (including thinking)
    cachedInputRate: number; // USD per 1M cached input tokens (typically 10% of input rate)
  }
> = {
  'gemini-2.5-pro': {
    inputRate: 1.25,
    outputRate: 10.0,
    cachedInputRate: 0.125,
  },
  'gemini-2.5-flash': {
    inputRate: 0.30,
    outputRate: 2.50,
    cachedInputRate: 0.03,
  },
  'gemini-2.5-flash-lite': {
    inputRate: 0.10,
    outputRate: 0.40,
    cachedInputRate: 0.01,
  },
  'gemini-2.0-flash-001': {
    inputRate: 0.10,
    outputRate: 0.40,
    cachedInputRate: 0.01,
  },
  'gemini-2.0-flash': {
    inputRate: 0.10,
    outputRate: 0.40,
    cachedInputRate: 0.01,
  },
};

/**
 * Returns the matching pricing rates for a given model name using substring matching.
 */
export function getPricingForModel(modelName: string) {
  const name = modelName.toLowerCase();
  if (name.includes('gemini-2.5-pro') || name.includes('1.5-pro')) {
    return MODEL_PRICING['gemini-2.5-pro'];
  }
  if (name.includes('gemini-2.5-flash-lite') || name.includes('flash-lite')) {
    return MODEL_PRICING['gemini-2.5-flash-lite'];
  }
  if (name.includes('gemini-2.5-flash') || name.includes('1.5-flash')) {
    return MODEL_PRICING['gemini-2.5-flash'];
  }
  if (name.includes('gemini-2.0-flash')) {
    return MODEL_PRICING['gemini-2.0-flash'];
  }
  // Generic fallback if not matched
  return MODEL_PRICING['gemini-2.5-flash'];
}

/**
 * Computes Vertex-equivalent dollar cost based on model and token counts.
 * If billingSource is 'ai_studio', cost is always 0 (free tier).
 */
export function computeCost(
  modelName: string,
  usage: TokenUsage,
  billingSource: 'vertex' | 'ai_studio' | string
): number {
  if (billingSource === 'ai_studio') {
    return 0; // free tier
  }

  const pricing = getPricingForModel(modelName);
  if (!pricing) {
    return 0;
  }

  const standardInput = Math.max(0, usage.promptTokenCount - usage.cachedContentTokenCount);
  const cachedInput = usage.cachedContentTokenCount;
  // Billed output tokens (standard candidate output includes thinking tokens)
  const outputTokens = usage.candidatesTokenCount;

  const inputCost = (standardInput / 1_000_000) * pricing.inputRate;
  const cachedCost = (cachedInput / 1_000_000) * pricing.cachedInputRate;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputRate;

  return inputCost + cachedCost + outputCost;
}
