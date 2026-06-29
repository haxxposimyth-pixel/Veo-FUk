import { z } from 'zod';

// ─── Project Schemas ──────────────────────────────────────────────────────────

export const movieConfigSchema = z.object({
  format: z.enum(['single_movie', 'episode_series', 'season_based_series']),
  genre: z.string(),
  tone: z.array(z.string()),
  story_engine_focus: z.object({
    combat: z.boolean(),
    world_exploration: z.boolean(),
    monster_action: z.boolean(),
    hero_journey: z.boolean(),
    season_continuity: z.boolean(),
  }),
  season_number: z.number().int().optional(),
  episode_number: z.number().int().optional(),
  hero_idea: z.string().optional(),
  villain_idea: z.string().optional(),
  world_idea: z.string().optional(),
  creature_idea: z.string().optional(),
});

export const projectCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  topic: z.string().min(10, 'Topic must be at least 10 characters').max(2000),
  visual_style: z.string().min(1, 'Visual style is required'),
  narration_language: z.string().min(1).default('English'),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1', '4:3']).default('16:9'),
  content_type: z.enum(['auto','narrative','documentary','presenter','montage']).default('auto'),
  content_profile: z.string().default('viral_story'),
  youtube_transcript: z.string().optional().nullable(),
  style_id: z.string().optional(),
  concept_brief: z.string().optional().nullable(),
  target_duration_minutes: z.number().int().default(8),
  movie_config: movieConfigSchema.optional(),
});

export const projectUpdateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  topic: z.string().min(10).optional(),
  visual_style: z.string().optional().default(''),
  narration_language: z.string().min(1).optional(),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional(),
  content_type: z.enum(['auto','narrative','documentary','presenter','montage']).optional(),
  content_profile: z.string().optional(),
  youtube_transcript: z.string().optional().nullable(),
  status: z.enum(['setup', 'bible', 'script', 'scenes', 'prompts', 'complete']).optional(),
  style_id: z.string().optional(),
  concept_brief: z.string().optional().nullable(),
  target_duration_minutes: z.number().int().optional(),
  movie_config: movieConfigSchema.optional(),
});

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const settingsUpdateSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().min(1, 'Model is required').default('gemini-2.5-pro'),
  temperature: z.number().min(0.0).max(2.0).default(0.8),
  maxTokens: z.number().min(1024).max(32768).default(8192),
  topP: z.number().min(0.0).max(1.0).optional(),
  topK: z.number().min(1).max(500).optional(),
  defaultVisualStyle: z.string().default('Cinematic Realism'),
  defaultLanguage: z.string().default('English'),
  defaultAspectRatio: z.string().default('16:9'),
  defaultSceneCount: z.number().min(12).max(18).default(14),

  // Simplified Config
  geminiApiKey: z.string().optional(),
  geminiEnabled: z.boolean().optional(),
  highwayApiEnabled: z.boolean().optional(),
  highwayApiKey: z.string().optional(),
  highwayApiBaseUrl: z.string().optional(),
  highwayApiModel: z.string().optional(),
  localLmEnabled: z.boolean().optional(),
  thirdPartyEnabled: z.boolean().optional(),
  thirdPartyBaseUrl: z.string().optional(),
  thirdPartyApiKey: z.string().optional(),
  thirdPartyModel: z.string().optional(),

  // Backup models and routing
  backupModelPrimary: z.string().optional(),
  backupModelSecondary: z.string().optional(),
  useAgentSpecificRouting: z.boolean().optional(),
  geminiApiKeys: z.array(z.string()).max(200).optional(),
  vertexEnabled: z.boolean().optional(),
  gcpProjectId: z.string().optional(),
  gcpLocation: z.string().optional(),
  generationConcurrency: z.number().min(1).max(10).default(5).optional(),
});

// ─── Phase / Scene Status ─────────────────────────────────────────────────────

export const phaseStatusSchema = z.enum(['pending', 'processing', 'done', 'failed']);

export const PhaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  phase_number: z.number().int().min(1).max(60),
  phase_type: z.string(),
  phase_title: z.string(),
  phase_content: z.string(),
  narration_text: z.string().optional().nullable(),
  narration_word_count: z.number().int().optional().nullable(),
  approved: z.number().int().min(0).max(1),
  scenes_generated: z.number().int().min(0).max(1),
  status: phaseStatusSchema,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const SceneSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  phase_id: z.string(),
  phase_number: z.number().int().min(1),
  scene_number: z.number().int().min(1),
  title: z.string(),
  scene_description: z.string(),
  continuity_notes: z.string(),
  narration_fragment: z.string(),
  veo_prompt_generated: z.number().int().min(0).max(1),
  status: phaseStatusSchema,
  raw_json: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  narration_word_count: z.number().int().min(0),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
