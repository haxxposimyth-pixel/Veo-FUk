import { BaseAgent } from './base-agent';
import {
  getConceptResearchPrompt,
  getConceptSystemPrompt,
  getConceptUserPrompt,
  getConceptTopicOnlyPrompt,
} from '../prompts/concept.prompt';
import { conceptAgentOutputSchema, conceptTopicOnlySchema, cleanTopicScaffolding } from 'shared';
import type { ConceptBrief } from 'shared';
import { GeminiService } from '../services/gemini.service';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { AGENT_MODEL_MAPPING } from '../config/agent-model-mapping';
import db from '../db/connection';

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
    contentProfile?: string,
    contentType?: string,
    region: string = 'auto',
  ): Promise<ConceptBrief> {
    const resolvedModel = AGENT_MODEL_MAPPING['ConceptAgent'] || 'gemini-2.5-pro';
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';

    // Step 1: Research grounded facts
    let groundedFacts: string | null = null;
    try {
      onChunk?.('Researching facts…\n');
      const settings = SettingsRepository.getSettings();
      const isVertex = settings.vertexEnabled === true;
      const gcpProjectId = settings.gcpProjectId;
      const gcpLocation = settings.gcpLocation || 'us-central1';

      const geminiService = new GeminiService(activeApiKey);
      if (isVertex && gcpProjectId) {
        geminiService.initVertexAI(gcpProjectId, gcpLocation);
      } else {
        console.warn(`[ConceptAgent] Grounding search skipped due to missing or disabled GCP config (vertexEnabled: ${isVertex}, gcpProjectId: ${gcpProjectId})`);
      }
      const researchPrompt = getConceptResearchPrompt(title, language, audience);
      const researchResult = await geminiService.generateGroundedText(resolvedModel, researchPrompt, activeApiKey);
      if (researchResult) {
        groundedFacts = researchResult.text;
        console.info(`[ConceptAgent] Grounded research succeeded. Found sources:`, researchResult.sources);
      }
    } catch (researchErr) {
      console.warn(`[ConceptAgent] Grounded research failed, falling back to LLM knowledge:`, researchErr);
    }

    // Try to load content_profile, content_type and movie_config if project already exists in DB
    let resolvedContentProfile = contentProfile;
    let resolvedContentType = contentType;
    let movieConfig: any = undefined;
    try {
      const row = db.prepare('SELECT * FROM projects WHERE title = ? OR topic = ? ORDER BY updated_at DESC LIMIT 1').get(title, title) as any;
      if (row) {
        if (!resolvedContentProfile) {
          resolvedContentProfile = row.content_profile;
        }
        if (!resolvedContentType) {
          resolvedContentType = row.content_type;
        }
        movieConfig = row.movie_config ? JSON.parse(row.movie_config) : undefined;
      }
    } catch (e) {
      // Non-fatal
    }

    // Step 2: Generate brief using prompt
    onChunk?.('Writing brief…\n');
    const systemPrompt = getConceptSystemPrompt(language, resolvedContentProfile, movieConfig, resolvedContentType);
    const userPrompt = getConceptUserPrompt(title, language, region, audience, length, groundedFacts, resolvedContentProfile, movieConfig, resolvedContentType);

    const brief = await this.generateStructured<ConceptBrief>(
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

    if (brief && typeof brief.project_topic === 'string') {
      brief.project_topic = cleanTopicScaffolding(brief.project_topic);
    }
    return brief;
  }

  async regenerateTopic(
    title: string,
    chosenTitle: string,
    language: string = 'English',
    audience: string = '',
    apiKey?: string,
    contentProfile?: string,
    contentType?: string,
    region: string = 'auto',
  ): Promise<any> {
    const resolvedModel = AGENT_MODEL_MAPPING['ConceptAgent'] || 'gemini-2.5-pro';
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';

    // Grounded facts for regeneration (best-effort)
    let groundedFacts: string | null = null;
    try {
      const settings = SettingsRepository.getSettings();
      const isVertex = settings.vertexEnabled === true;
      const gcpProjectId = settings.gcpProjectId;
      const gcpLocation = settings.gcpLocation || 'us-central1';

      const geminiService = new GeminiService(activeApiKey);
      if (isVertex && gcpProjectId) {
        geminiService.initVertexAI(gcpProjectId, gcpLocation);
      } else {
        console.warn(`[ConceptAgent] Grounding search skipped during regeneration due to missing or disabled GCP config (vertexEnabled: ${isVertex}, gcpProjectId: ${gcpProjectId})`);
      }
      const researchPrompt = getConceptResearchPrompt(chosenTitle, language, audience);
      const researchResult = await geminiService.generateGroundedText(resolvedModel, researchPrompt, activeApiKey);
      if (researchResult) {
        groundedFacts = researchResult.text;
      }
    } catch (err) {
      console.warn(`[ConceptAgent] Grounded research failed during regeneration:`, err);
    }

    // Try to load content_profile, content_type and movie_config if project already exists in DB
    let resolvedContentProfile = contentProfile;
    let resolvedContentType = contentType;
    let movieConfig: any = undefined;
    try {
      const row = db.prepare('SELECT * FROM projects WHERE title = ? OR topic = ? ORDER BY updated_at DESC LIMIT 1').get(title, title) as any;
      if (row) {
        if (!resolvedContentProfile) {
          resolvedContentProfile = row.content_profile;
        }
        if (!resolvedContentType) {
          resolvedContentType = row.content_type;
        }
        movieConfig = row.movie_config ? JSON.parse(row.movie_config) : undefined;
      }
    } catch (e) {
      // Non-fatal
    }

    const systemPrompt = getConceptSystemPrompt(language, resolvedContentProfile, movieConfig, resolvedContentType);
    const userPrompt = getConceptTopicOnlyPrompt(title, chosenTitle, language, region, audience, groundedFacts, resolvedContentProfile, movieConfig, resolvedContentType);

    const updated = await this.generateStructured<any>(
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

    if (updated && typeof updated.project_topic === 'string') {
      updated.project_topic = cleanTopicScaffolding(updated.project_topic);
    }
    return updated;
  }
}

export const conceptAgent = new ConceptAgent();
