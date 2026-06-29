import type { RenderFamily } from '../constants/render-families';


// ─── Settings ────────────────────────────────────────────────────────────────

export interface Setting {
  key: string;
  value: string;
  updated_at?: string;
}

export interface ApiSettings {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  defaultVisualStyle: string;
  defaultLanguage: string;
  defaultAspectRatio: string;
  defaultSceneCount: number;

  // Simplified Config
  geminiApiKey?: string;
  geminiEnabled?: boolean;
  highwayApiEnabled?: boolean;
  highwayApiKey?: string;
  highwayApiBaseUrl?: string;
  highwayApiModel?: string;
  localLmEnabled?: boolean;
  thirdPartyEnabled?: boolean;
  thirdPartyBaseUrl?: string;
  thirdPartyApiKey?: string;
  thirdPartyModel?: string;

  // Premium / Fallback & Routing settings
  backupModelPrimary?: string;
  backupModelSecondary?: string;
  useAgentSpecificRouting?: boolean;
  geminiApiKeys?: string[];
  vertexEnabled?: boolean;
  gcpProjectId?: string;
  gcpLocation?: string;
  generationConcurrency?: number;
}

export interface ModelUsage {
  model: string;
  tokensUsed: number;
  tokensLimit: number;
  requestsUsed: number;
  requestsLimit: number;
}


// ─── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus = 'setup' | 'planning' | 'bible' | 'script' | 'scenes' | 'prompts' | 'complete';

export interface MovieConfig {
  format: 'single_movie' | 'episode_series' | 'season_based_series';
  genre: string;
  tone: string[];
  story_engine_focus: {
    combat: boolean;
    world_exploration: boolean;
    monster_action: boolean;
    hero_journey: boolean;
    season_continuity: boolean;
  };
  season_number?: number;
  episode_number?: number;
  hero_idea?: string;
  villain_idea?: string;
  world_idea?: string;
  creature_idea?: string;
}

export interface Project {
  id: string;
  title: string;
  topic: string;
  visual_style: string;
  narration_language: string;
  aspect_ratio: string;
  content_type: string;
  content_profile?: string;
  youtube_transcript?: string;
  status: ProjectStatus;
  created_at?: string;
  updated_at?: string;
  has_metadata?: number | boolean;
  concept_brief?: string;
  style_id?: string;
  target_duration_minutes?: number;
  movie_config?: MovieConfig;
}

// ─── Production Bible ─────────────────────────────────────────────────────────

export interface AppearanceLock {
  ethnicity: string;
  approximate_age: string;
  gender: string;
  skin_tone: string;
  hair: string;
  eyes: string;
  face_structure: string;
  distinguishing_features: string;
  primary_clothing: string;
  clothing_colors: string[];
  clothing_era: string;
  accessories: string;
  forbidden_appearance_changes: string[];
}

export interface CharacterRosterItem {
  id: string;
  name: string;
  role: string;
  physical_description: string;
  costume_description: string;
  voice_tone: string;
  significance: string;
  appearance_lock: AppearanceLock;
}

export interface LocationRosterItem {
  id: string;
  name: string;
  type: string;
  atmosphere: string;
  lighting_notes: string;
  time_of_day_default: string;
  visual_signature: string;
}

export interface ObjectRegistryItem {
  id: string;
  object_id?: string;
  name: string;
  description: string;
  visual_description?: string;
  category?: string;
  owner_or_location?: string;
  default_state?: string;
  active_state?: string;
  forbidden_variations?: string[];
  symbolic_meaning: string;
  screen_time: string;
  is_branded_product?: boolean;
  is_hero_prop?: boolean;
  visual_lock?: string;
}

export interface VisualStyleLock {
  color_palette: string[];
  color_mood: string;
  film_grain: boolean;
  aspect_ratio: string;
  camera_movement_style: string;
  lighting_style: string;
  forbidden_elements: string[];
  veo_style_tokens: string[];
  style_name?: string;
}

export interface ProductionBibleMeta {
  topic: string;
  genre: string;
  tone: string;
  target_duration_minutes: number;
  language: string;
  aspect_ratio: string;
}

export interface ProductionBibleData {
  character_roster: CharacterRosterItem[];
  location_roster: LocationRosterItem[];
  object_registry: ObjectRegistryItem[];
  visual_style_lock: VisualStyleLock;
  meta: ProductionBibleMeta;
  version?: number;
}

export interface ProductionBible {
  id: string;
  project_id: string;
  character_roster: string;   // JSON string
  location_roster: string;    // JSON string
  object_registry: string;    // JSON string
  visual_style_lock: string;  // JSON string
  raw_json: string;           // Full ProductionBibleData JSON
  version: number;
  created_at?: string;
  updated_at?: string;
}

// ─── Script ───────────────────────────────────────────────────────────────────

export interface ScriptPhaseItem {
  phase_number: number;
  phase_type: 'hook' | 'build_up' | 'escalation' | 'climax' | 'outro';
  phase_title: string;
  phase_content: string;
  narration_text: string;
  narration_word_count: number;
  key_events: string[];
  key_facts?: string[];
  key_images?: string[];
  character_ids_active: string[];
  location_id_primary: string;
  estimated_duration_seconds: number;
  viral_hook_rating: number;
  rehook_type?: 'new_question' | 'revelation' | 'stakes_escalation' | 'pattern_interrupt' | 'pre_climax_spike' | null;
  open_loop_role?: 'plant' | 'payoff' | 'none';
}

export interface ScriptData {
  title: string;
  total_estimated_duration_minutes: number;
  phases: ScriptPhaseItem[];
  target_audience?: 'gen_z' | 'millennial' | 'gen_x' | 'general';
  hook_regenerate?: 'on' | 'off';
  pre_climax_spike?: 'on' | 'off';
  long_open_loop?: 'on' | 'off';
}

export interface Script {
  id: string;
  project_id: string;
  raw_json: string;  // JSON string of ScriptData
  approved: number;  // 0 or 1
  version: number;
  created_at?: string;
  updated_at?: string;
}

export type PhaseStatus = 'pending' | 'processing' | 'done' | 'failed' | 'needs_review';

export interface Phase {
  id: string;
  project_id: string;
  phase_number: number;
  phase_type: string;
  phase_title: string;
  phase_content: string;
  narration_text?: string | null;
  narration_word_count?: number | null;
  approved: number;          // 0 or 1
  scenes_generated: number;  // 0 or 1
  status: PhaseStatus;
  created_at?: string;
  updated_at?: string;
  hook_score?: number | null;
  hook_score_breakdown?: string | null;
  hook_score_passed?: number | null;
  hook_score_borderline?: number | null;
  rehook_required: number;
  rehook_validated?: number | null;
  rehook_type?: 'new_question' | 'revelation' | 'stakes_escalation' | 'pattern_interrupt' | null;
}

// ─── Scenes ───────────────────────────────────────────────────────────────────

export interface SceneItem {
  scene_number: number;
  title: string;
  scene_description: string;
  continuity_notes: string;
  narration_fragment: string;
  character_ids_present: string[];
  location_id: string;
  object_ids_featured: string[];
  emotional_beat: string;
  transition_to_next: string;
  estimated_duration_seconds: number;
  is_dialogue: boolean;
  is_action: boolean;
  narration_word_count: number;
  status?: PhaseStatus;
  visual_state_snapshot?: any;
  continuity_stale?: number;
}

export interface SceneBreakdownData {
  phase_number: number;
  phase_title: string;
  total_scenes: number;
  scenes: SceneItem[];
}

export interface Scene {
  id: string;
  project_id: string;
  phase_id: string;
  phase_number: number;
  scene_number: number;
  title: string;
  scene_description: string;
  continuity_notes: string;
  narration_fragment: string;
  veo_prompt_generated: number;  // 0 or 1
  status: PhaseStatus;
  raw_json: string;              // JSON string of SceneItem
  created_at?: string;
  updated_at?: string;
  narration_word_count: number;
  continuity_stale?: number;
  visual_state_snapshot?: string | null;
}

// ─── Veo Prompts ─────────────────────────────────────────────────────────────

export interface OverlaySuggestion {
  text: string;
  type: 'label' | 'callout' | 'title' | 'annotation';
  target: string;
  timing?: string;
}

export interface VeoPromptData {
  prompt_number: number | string;  // e.g. "P1_S1_V1" or 1
  visual: string;
  shot: string;
  shot_type?: 'establishing' | 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'aerial' | 'pov' | 'over_shoulder' | 'insert';
  lens: string;
  lighting: string;
  camera: string;
  ambient_sound: string;
  sfx: string;
  dialogue: string;
  avoid: string;
  connection: string;
  narration: string;
  duration_seconds: number;
  scene_type?: 'rapid_cut' | 'standard' | 'short_punch' | 'slow_burn';
  veo_full_prompt: string;
  visual_truncated?: number;
  avoid_contradiction?: number;
  bible_version?: number;
  spoken_on_camera?: boolean;
  narration_audio_source?: 'veo_on_camera' | 'elevenlabs_vo';
  overlay_suggestions?: OverlaySuggestion[];
}

export interface VeoPrompt {
  id: string;
  project_id: string;
  scene_id: string;
  phase_number: number;
  scene_number: number;
  prompt_number: number | string;
  visual: string;
  shot: string;
  shot_type?: 'establishing' | 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'aerial' | 'pov' | 'over_shoulder' | 'insert';
  lens: string;
  lighting: string;
  camera: string;
  ambient_sound: string;
  sfx: string;
  dialogue: string;
  avoid: string;
  connection: string;
  narration: string;
  raw_json: string;  // JSON string of VeoPromptData
  version: number;
  manually_edited: number;
  created_at?: string;
  updated_at?: string;
  visual_truncated?: number;
  avoid_contradiction?: number;
  spoken_on_camera?: boolean;
  narration_audio_source?: 'veo_on_camera' | 'elevenlabs_vo';
  scene_type?: 'rapid_cut' | 'standard' | 'short_punch' | 'slow_burn';
  bible_version?: number;
  bible_outdated?: boolean;
}

// ─── Agent Logs ───────────────────────────────────────────────────────────────

export interface AgentLog {
  id: string;
  project_id: string | null;
  agent_name: string;
  model_used: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface StorageInfo {
  dbSize: string;
  projectCount: number;
  totalPrompts: number;
}

// ─── Custom Styles ────────────────────────────────────────────────────────────

export interface CustomStyle {
  id: string;
  name: string;
  description: string;
  render_family?: RenderFamily | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Continuity Warnings ──────────────────────────────────────────────────────

export interface ContinuityWarning {
  id: string;
  project_id: string;
  phase_id: string;
  prompt_number: number;
  field: string;
  issue: string;
  suggestion: string;
  resolved: boolean;
  cross_phase?: number;
  created_at?: string;
}

// ─── Story Planning ───────────────────────────────────────────────────────────

export interface StoryPlanItem {
  name: string;
  concept: string;
}

export interface StoryPlanData {
  story_outline: string;
  character_list: StoryPlanItem[];
  location_list: StoryPlanItem[];
  object_list: StoryPlanItem[];
  video_type: string;
}

export interface StoryPlan {
  id: string;
  project_id: string;
  story_outline: string;
  character_list: string; // JSON string
  location_list: string;  // JSON string
  object_list: string;    // JSON string
  approved: number;
  video_type: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScriptTone {
  pacing: number;
  emotional_intensity: number;
  narration_style: number;
  target_audience?: 'gen_z' | 'millennial' | 'gen_x' | 'general' | 'auto';
  hook_regenerate?: 'on' | 'off' | 'auto';
  pre_climax_spike?: 'on' | 'off' | 'auto';
  long_open_loop?: 'on' | 'off' | 'auto';
}

export interface HookScore {
  pattern_interrupt: number;
  stakes_clarity: number;
  curiosity_gap: number;
  scroll_stop_power: number;
  overall: number;
  feedback: string;
  suggestions: string[];
}

export interface LocalHookScore extends HookScore {
  hard_stop_violated: boolean;
}


export interface PhaseAnalysis {
  phase_number: number;
  retention_score: number;
  hook_density: number;
  emotional_intensity: number;
  rehook_present: boolean;
}

export interface StoryAnalysisData {
  phase_analyses: PhaseAnalysis[];
  overall_retention_score: number;
  dropout_risk_phases: number[];
  peak_moment_phase: number;
  summary: string;
}

export interface StoryAnalysis {
  id: string;
  project_id: string;
  raw_json: string; // JSON string of StoryAnalysisData
  overall_retention_score: number;
  dropout_risk_phases: string; // JSON string of number[]
  peak_moment_phase: number;
  summary: string;
  created_at?: string;
}

export interface VideoMetadataData {
  titles: Array<{ text: string; structure_type: string; char_count: number }>;
  description: string;
  chapters: Array<{ timestamp: string; label: string }>;
  tags: string[];
  hashtags: string[];
  thumbnail_hook: string;
}

export interface VideoMetadata {
  id: string;
  project_id: string;
  raw_json: string;
  selected_title: string | null;
  description: string;
  chapters: string; // JSON array string
  tags: string; // JSON array string
  hashtags: string; // JSON array string
  thumbnail_hook: string;
  created_at?: string;
}

export interface CredibilityIssue {
  phase_number: number;
  claim: string;
  issue_type: 'wrong_number' | 'wrong_date' | 'wrong_unit' | 'wrong_distance_or_depth' | 'step_out_of_order' | 'unverifiable' | 'exaggeration' | 'internal_contradiction';
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  suggested_correction?: string;
}

export interface CredibilityReviewData {
  overall_credibility_score: number;
  issues: CredibilityIssue[];
  summary: string;
  needs_recheck?: boolean;
  stale?: boolean;
}

export interface CredibilityReview {
  id: string;
  project_id: string;
  raw_json: string; // JSON string of CredibilityReviewData
  overall_credibility_score: number;
  summary: string;
  created_at?: string;
}

export interface ConceptBrief {
  content_type: 'documentary' | 'narrative' | 'presenter';
  project_topic: string;
  titles: Array<{ text: string; angle?: string; click_score: number }>;
  engagement_blueprint: {
    core_curiosity_question: string;
    hook_strategy: string;
    open_loops: string[];
    escalation_logic: string;
    emotional_driver: string;
    payoff: string;
  };
  target_audience?: string;
  suggested_length?: string;
  thumbnail_concept?: string;
  keywords?: string[];
}




