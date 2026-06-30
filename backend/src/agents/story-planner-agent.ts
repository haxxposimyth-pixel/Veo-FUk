import { BaseAgent } from './base-agent';
import { getStoryPlanSystemPrompt, getStoryPlanUserPrompt } from '../prompts/story-plan.prompt';
import { storyPlanAgentOutputSchema, resolveContentProfile, storyPlanItemSchema } from 'shared';
import type { StoryPlanData } from 'shared';
import { ProjectRepository } from '../db/repositories/project.repo';
import { z } from 'zod';

const cinematicStoryPlanSchema = z
  .object({
    story_outline: z.string().min(10),
    character_list: z.array(storyPlanItemSchema).optional(),
    characters: z.array(storyPlanItemSchema).optional(),
    location_list: z.array(storyPlanItemSchema).min(1).optional(),
    locations: z.array(storyPlanItemSchema).min(1).optional(),
    object_list: z.array(storyPlanItemSchema).min(1).optional(),
    objects: z.array(storyPlanItemSchema).min(1).optional(),
    props: z.array(storyPlanItemSchema).min(1).optional(),
    video_type: z.enum(['narrative', 'documentary', 'presenter', 'montage']).optional().default('narrative'),
    raw_json: z.any().optional(),
  })
  .passthrough()
  .transform((v) => {
     const characters = v.character_list ?? v.characters ?? [];
     const locations = v.location_list ?? v.locations ?? [];
     const objects = v.object_list ?? v.objects ?? v.props ?? [];
     return {
       story_outline: v.story_outline,
       character_list: characters,
       location_list: locations,
       object_list: objects,
       video_type: v.video_type ?? 'narrative',
       raw_json: v.raw_json,
     };
  });

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
  ): Promise<StoryPlanData & { raw_json?: any }> {
    const profile = resolveContentProfile(contentProfileId);

    // Thread project.movie_config into story planner
    const project = ProjectRepository.findById(projectId);
    const movieConfig = project?.movie_config;
    const region = project?.region || 'auto';

    const systemPrompt = getStoryPlanSystemPrompt(profile);
    const userPrompt   = getStoryPlanUserPrompt(
      topic,
      visualStyle,
      language,
      aspectRatio,
      youtubeTranscript,
      contentType,
      engagementBlueprint,
      profile,
      movieConfig,
      project?.target_duration_minutes,
      region
    );

    const schemaToUse = contentProfileId === 'cinematic_series'
      ? cinematicStoryPlanSchema
      : storyPlanAgentOutputSchema;

    return this.generateStructured<any>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: schemaToUse,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk,
    );
  }
}

export const storyPlannerAgent = new StoryPlannerAgent();
