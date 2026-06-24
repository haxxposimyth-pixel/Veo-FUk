import { BaseAgent } from './base-agent';
import { credibilityReviewSchema } from 'shared';
import type { CredibilityReviewData } from 'shared';
import { getCredibilityReviewPrompt } from '../prompts/credibility.prompt';

export class CredibilityReviewerAgent extends BaseAgent {
  constructor() {
    super('CredibilityReviewerAgent');
  }

  /**
   * Reviews the full script phases for factual credibility and consistency.
   */
  async analyze(
    projectId: string,
    narrationPhases: { phase_number: number; phase_title: string; narration_text: string }[],
    project: { content_type?: string; topic: string; narration_language?: string },
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void
  ): Promise<CredibilityReviewData> {
    const systemPrompt = `You are a professional fact-checker and script integrity reviewer. You audit narration script files for factual, numerical, step-order, or logical discrepancies and return a structured JSON report.`;

    const userPrompt = getCredibilityReviewPrompt(
      narrationPhases,
      project.content_type || 'auto',
      project.topic,
      project.narration_language || 'English'
    );

    return await this.generateStructured<CredibilityReviewData>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: credibilityReviewSchema,
        temperature: config?.temperature ?? 0.1,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk
    );
  }
}

export const credibilityReviewerAgent = new CredibilityReviewerAgent();
