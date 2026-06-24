import { BaseAgent } from './base-agent';
import {
  getConceptResearchPrompt,
  getConceptSystemPrompt,
  getConceptUserPrompt,
  getConceptTopicOnlyPrompt,
} from '../prompts/concept.prompt';
import { conceptAgentOutputSchema, conceptTopicOnlySchema } from 'shared';
import type { ConceptBrief } from 'shared';
import { GeminiService } from '../services/gemini.service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { AGENT_MODEL_MAPPING } from '../config/agent-model-mapping';


export class ConceptAgent extends BaseAgent {
  constructor() {
    super('ConceptAgent');
  }

  async run(
    title: string,
    language: string = 'English',
    audience: string = '',
    length: string = '',
    apiKey?: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ConceptBrief> {
    const resolvedModel = AGENT_MODEL_MAPPING['ConceptAgent'] || 'gemini-2.5-pro';
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';

    // Step 1: Research grounded facts
    let groundedFacts: string | null = null;
    try {
      onChunk?.('Researching facts…\n');
      const geminiService = new GeminiService(activeApiKey);
      const researchPrompt = getConceptResearchPrompt(title, language, audience);
      const researchResult = await geminiService.generateGroundedText(resolvedModel, researchPrompt, activeApiKey);
      if (researchResult) {
        groundedFacts = researchResult.text;
        console.info(`[ConceptAgent] Grounded research succeeded. Found sources:`, researchResult.sources);
      }
    } catch (researchErr) {
      console.warn(`[ConceptAgent] Grounded research failed, falling back to LLM knowledge:`, researchErr);
    }

    // Step 2: Generate brief using prompt
    onChunk?.('Writing brief…\n');
    const systemPrompt = getConceptSystemPrompt(language);
    const userPrompt = getConceptUserPrompt(title, language, audience, length, groundedFacts);

    return this.generateStructured<ConceptBrief>(
      null, // projectId is null for new projects
      activeApiKey,
      resolvedModel,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: conceptAgentOutputSchema,
        temperature: 0.85,
        maxOutputTokens: 4000,
      },
      onChunk
    );
  }

  async regenerateTopic(
    title: string,
    chosenTitle: string,
    language: string = 'English',
    audience: string = '',
    apiKey?: string,
  ): Promise<any> {
    const resolvedModel = AGENT_MODEL_MAPPING['ConceptAgent'] || 'gemini-2.5-pro';
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';

    // Grounded facts for regeneration (best-effort)
    let groundedFacts: string | null = null;
    try {
      const geminiService = new GeminiService(activeApiKey);
      const researchPrompt = getConceptResearchPrompt(chosenTitle, language, audience);
      const researchResult = await geminiService.generateGroundedText(resolvedModel, researchPrompt, activeApiKey);
      if (researchResult) {
        groundedFacts = researchResult.text;
      }
    } catch (err) {
      console.warn(`[ConceptAgent] Grounded research failed during regeneration:`, err);
    }

    const systemPrompt = getConceptSystemPrompt(language);
    const userPrompt = getConceptTopicOnlyPrompt(title, chosenTitle, language, audience, groundedFacts);

    return this.generateStructured<any>(
      null,
      activeApiKey,
      resolvedModel,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: conceptTopicOnlySchema,
        temperature: 0.85,
        maxOutputTokens: 4000,
      }
    );
  }
}

export const conceptAgent = new ConceptAgent();

