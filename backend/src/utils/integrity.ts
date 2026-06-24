import db from '../db/connection';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { narrationFitsDuration, buildPhasePlan, resolveContentProfile, SOFT_MIN_NARRATION_WORDS } from 'shared';

export interface IntegrityPhaseIssue {
  phase_number: number;
  status: string;
  issues: ('incomplete' | 'failed' | 'word_count_violation')[];
  word_count: number;
}

export interface IntegritySceneIssue {
  scene_id: string;
  phase_number: number;
  scene_number: number;
  title: string;
  issues: ('failed' | 'continuity-stale' | 'missing-snapshot')[];
}

export interface IntegrityPromptIssue {
  prompt_id: string;
  prompt_number: number;
  phase_number: number;
  scene_number: number;
  issues: ('status_failed' | 'visual_truncated' | 'empty_required_fields' | 'empty_narration_on_sub_prompt' | 'narration_budget_violation' | 'bible_outdated' | 'appearance_violation_uncorrected')[];
}

export interface IntegrityReport {
  phases: IntegrityPhaseIssue[];
  scenes: IntegritySceneIssue[];
  prompts: IntegrityPromptIssue[];
  continuity: {
    unresolved_count: number;
    per_phase_count: number;
    cross_phase_count: number;
  };
  verdict: 'ready' | 'issues';
  counts: {
    phases: number;
    scenes: number;
    prompts: number;
    continuity: number;
  };
  phases_not_yet_generated: number;
}

/**
 * Checks the full integrity of a project and returns a report with a verdict.
 */
// === VVS FIX 4 START ===
export function checkProjectIntegrity(projectId: string): IntegrityReport {
  const phaseIssues: IntegrityPhaseIssue[] = [];
  const sceneIssues: IntegritySceneIssue[] = [];
  const promptIssues: IntegrityPromptIssue[] = [];

  // 1. Fetch current Bible version
  const bible = BibleRepository.findByProjectId(projectId);
  const currentBibleVersion = bible ? bible.version : 1;

  // Fetch scenes early
  const scenes = SceneRepository.findByProjectId(projectId);

  // 2. Phases check
  const phases = ScriptRepository.findPhasesByProjectId(projectId);
  const project = ProjectRepository.findById(projectId);
  const profile = resolveContentProfile(project?.content_profile || 'viral_story');
  const plan = buildPhasePlan(project?.target_duration_minutes ?? 8, profile);
  const totalExpectedPhases = plan.phaseCount;
  let phases_not_yet_generated = 0;

  for (let pNum = 1; pNum <= totalExpectedPhases; pNum++) {
    const phase = phases.find((p) => p.phase_number === pNum);
    if (!phase) {
      phases_not_yet_generated++;
      continue;
    }

    const issues: ('incomplete' | 'failed' | 'word_count_violation')[] = [];
    const phaseScenes = scenes.filter((s) => s.phase_number === pNum);
    const allScenesFailed = phase.scenes_generated && phaseScenes.length > 0 && phaseScenes.every((s) => s.status === 'failed');

    if (phase.status === 'failed' || allScenesFailed) {
      issues.push('failed');
    } else if (phase.status !== 'done') {
      issues.push('incomplete');
    }

    // Check phase narration word count
    const narrationText = phase.narration_text || phase.phase_content || '';
    const wc = narrationText.trim().split(/\s+/).filter(Boolean).length;
    const absoluteMin = pNum === 1 ? 60 : (plan.wordsPerPhase >= 120 ? SOFT_MIN_NARRATION_WORDS : 60);
    if (wc < absoluteMin) {
      issues.push('word_count_violation');
    }

    if (issues.length > 0) {
      phaseIssues.push({
        phase_number: pNum,
        status: phase.status,
        issues,
        word_count: wc,
      });
    }
  }

  // 3. Scenes check
  for (const scene of scenes) {
    const issues: ('failed' | 'continuity-stale' | 'missing-snapshot')[] = [];
    if (scene.status === 'failed') {
      issues.push('failed');
    }
    if ((scene as any).continuity_stale === 1) {
      issues.push('continuity-stale');
    }
    if (!scene.visual_state_snapshot || scene.visual_state_snapshot.trim() === '') {
      issues.push('missing-snapshot');
    }

    if (issues.length > 0) {
      sceneIssues.push({
        scene_id: scene.id,
        phase_number: scene.phase_number,
        scene_number: scene.scene_number,
        title: scene.title,
        issues,
      });
    }
  }

  // 4. Prompts check
  const prompts = VeoPromptRepository.findByProjectId(projectId);
  
  // Create a map to check for missing prompts per scene
  const promptMap = new Map<string, typeof prompts[0]>();
  for (const p of prompts) {
    promptMap.set(`${p.phase_number}_${p.scene_number}`, p);
  }

  // Check existing prompts
  for (const p of prompts) {
    let parsed: any = {};
    try {
      parsed = JSON.parse(p.raw_json);
    } catch (e) {}

    const issues: ('status_failed' | 'visual_truncated' | 'empty_required_fields' | 'empty_narration_on_sub_prompt' | 'narration_budget_violation' | 'bible_outdated' | 'appearance_violation_uncorrected')[] = [];
    
    // Status Failed (status is stored in raw_json)
    if (parsed.status === 'failed' || parsed.status === 'stale') {
      issues.push('status_failed');
    }

    // Truncated (visual_truncated can be in db column or raw_json)
    if ((p as any).visual_truncated === 1 || parsed.visual_truncated === 1) {
      issues.push('visual_truncated');
    }

    // Empty required fields
    const requiredFields = ['visual', 'shot', 'shot_type', 'lens', 'lighting', 'camera', 'ambient_sound', 'avoid', 'connection', 'narration', 'duration_seconds'];
    const hasEmptyRequired = requiredFields.some((field) => {
      const val = parsed[field];
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    });
    if (hasEmptyRequired) {
      issues.push('empty_required_fields');
    }

    if (Number(p.prompt_number) > 1 && (p.narration === null || p.narration === undefined || p.narration.trim() === '')) {
      issues.push('empty_narration_on_sub_prompt');
    }

    // Narration word count fit duration budget
    const narrationText = (parsed.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
    const words = narrationText.split(/\s+/).filter(Boolean).length;
    const duration = parsed.duration_seconds || 8;
    if (parsed.narration && parsed.narration !== '[No narration — visual only]' && !narrationFitsDuration(words, duration)) {
      issues.push('narration_budget_violation');
    }

    // Outdated Production Bible version
    const bible_version = parsed.bible_version ?? 1;
    if (bible_version < currentBibleVersion) {
      issues.push('bible_outdated');
    }

    // Appearance violation without correction
    const appViolation = (p as any).appearance_violation === 1 || parsed.appearance_violation === 1;
    const appCorrected = (p as any).appearance_corrected === 1 || parsed.appearance_corrected === 1;
    if (appViolation && !appCorrected) {
      issues.push('appearance_violation_uncorrected');
    }

    if (issues.length > 0) {
      promptIssues.push({
        prompt_id: p.id,
        prompt_number: parseInt(String(p.prompt_number), 10) || 0,
        phase_number: p.phase_number,
        scene_number: p.scene_number,
        issues,
      });
    }
  }

  // 5. Continuity check
  const warnings = ContinuityRepository.findByProject(projectId);
  const unresolvedWarnings = warnings.filter((w) => !w.resolved);
  const perPhaseCount = unresolvedWarnings.filter((w) => w.cross_phase !== 1).length;
  const crossPhaseCount = unresolvedWarnings.filter((w) => w.cross_phase === 1).length;

  // 6. Final verdict compilation
  const hasMissingPrompts = scenes.length === 0 || scenes.some(s => !promptMap.has(`${s.phase_number}_${s.scene_number}`));

  const isReady =
    phaseIssues.length === 0 &&
    sceneIssues.length === 0 &&
    promptIssues.length === 0 &&
    !hasMissingPrompts &&
    unresolvedWarnings.length === 0;

  const verdict = isReady ? 'ready' : 'issues';

  return {
    phases: phaseIssues,
    scenes: sceneIssues,
    prompts: promptIssues,
    continuity: {
      unresolved_count: unresolvedWarnings.length,
      per_phase_count: perPhaseCount,
      cross_phase_count: crossPhaseCount,
    },
    verdict,
    counts: {
      phases: phaseIssues.length,
      scenes: sceneIssues.length,
      prompts: promptIssues.length + (hasMissingPrompts ? 1 : 0),
      continuity: unresolvedWarnings.length,
    },
    phases_not_yet_generated,
  };
}
// === VVS FIX 4 END ===

/**
 * Checks if all predecessor phases (< phaseNumber) are complete and have snapshots on their last scene.
 */
export function checkPredecessorPhases(projectId: string, phaseNumber: number): boolean {
  for (let p = 1; p < phaseNumber; p++) {
    const phase = ScriptRepository.findPhaseByNumber(projectId, p);
    if (!phase || phase.status !== 'done') {
      return false;
    }
    const scenes = SceneRepository.findByPhase(projectId, p);
    if (scenes.length === 0) {
      return false;
    }
    const lastScene = scenes[scenes.length - 1];
    if (!lastScene || !lastScene.visual_state_snapshot) {
      return false;
    }
  }
  return true;
}
