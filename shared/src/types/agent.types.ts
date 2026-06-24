import type { ProductionBibleData, ScriptPhaseItem, VisualStyleLock } from './project.types';

// ─── Agent Inputs ─────────────────────────────────────────────────────────────

export interface ProductionBibleAgentInput {
  project_id: string;
  topic: string;
  visual_style: string;
  narration_language: string;
  aspect_ratio: string;
}

export interface ScriptAgentInput {
  project_id: string;
  topic: string;
  production_bible: ProductionBibleData;
}

export interface SceneAgentInput {
  project_id: string;
  phase_number: number;
  scene_count_target: number;
  phase: ScriptPhaseItem;
  production_bible: ProductionBibleData;
}

export interface VeoAgentInput {
  project_id: string;
  phase_number: number;
  scene_number: number;
  scene: {
    scene_number: number;
    title: string;
    scene_description: string;
    continuity_notes: string;
    narration_fragment: string;
    emotional_beat: string;
    transition_to_next: string;
    estimated_duration_seconds: number;
    is_dialogue: boolean;
    is_action: boolean;
    character_details_resolved: string;
    location_details_resolved: string;
    object_details_resolved: string;
  };
  visual_style_lock: VisualStyleLock;
}
