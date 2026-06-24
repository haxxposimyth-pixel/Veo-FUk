import { BaseAgent } from './base-agent';
import { getStoryPlanSystemPrompt, getStoryPlanUserPrompt } from '../prompts/story-plan.prompt';
import { storyPlanAgentOutputSchema, resolveContentProfile } from 'shared';
import type { StoryPlanData } from 'shared';

export class StoryPlannerAgent extends BaseAgent {
  constructor() {
    super('StoryPlannerAgent');
  }

  /**
   * Generates the high-level Story Plan for a project.
   */
  async run(
    topic: string,
    visualStyle: string,
    language: string,
    aspectRatio: string,
    projectId: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    youtubeTranscript?: string,
    contentType: string = 'auto',
    engagementBlueprint?: any,
    contentProfileId: string = 'viral_story',
  ): Promise<StoryPlanData> {
    const profile = resolveContentProfile(contentProfileId);
    const systemPrompt = getStoryPlanSystemPrompt(profile);
    const userPrompt   = getStoryPlanUserPrompt(topic, visualStyle, language, aspectRatio, youtubeTranscript, contentType, engagementBlueprint, profile);

    return this.generateStructured<StoryPlanData>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: storyPlanAgentOutputSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk,
    );
  }
}

export const storyPlannerAgent = new StoryPlannerAgent();
