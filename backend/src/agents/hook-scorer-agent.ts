import { BaseAgent } from './base-agent';
import { localHookScoreSchema, resolveContentProfile } from 'shared';
import type { LocalHookScore } from 'shared';
import { z } from 'zod';
import { ProjectRepository } from '../db/repositories/project.repo';

function getMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[1]; // Since arr length is 3, index 1 is the median
}

function getVariance(arr: number[]): number {
  const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
  const squareDiffs = arr.map(val => Math.pow(val - mean, 2));
  return squareDiffs.reduce((sum, val) => sum + val, 0) / arr.length;
}

export class HookScorerAgent extends BaseAgent {
  constructor() {
    super('HookScorerAgent');
  }

  async runSingle(
    projectId: string | null,
    narrationText: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number; scoringObjective?: string },
  ): Promise<LocalHookScore> {
    let profileKey = 'viral_story';
    if (projectId) {
      const project = ProjectRepository.findById(projectId);
      if (project?.content_profile) {
        profileKey = project.content_profile;
      }
    }
    const profile = resolveContentProfile(profileKey);

    const objective = config?.scoringObjective || profile.scoringObjective;
    const criteriaPrompts = profile.hookCriteria
      .map((c, idx) => `${idx + 1}. ${c.key}: ${c.prompt}`)
      .join('\n');

    const prompt = `${objective}
${criteriaPrompts}

Add a new check:
5. hard_stop_violated (boolean): Set this to true if the hook continues past the curiosity gap question with explanatory content (such as biographical background, academic context, pre-answering the cliffhanger, or sentences like 'To understand this...', 'To answer that...', or 'We must first...'). Set to false if it strictly follows the hook structure and stops immediately after the curiosity gap question.

Return ONLY valid JSON in this exact shape:
{
  "pattern_interrupt": number,
  "stakes_clarity": number,
  "curiosity_gap": number,
  "scroll_stop_power": number,
  "hard_stop_violated": boolean,
  "overall": number,
  "feedback": "string",
  "suggestions": ["string"]
}

Scoring Rules:
- overall = average of all 4 scores (pattern_interrupt, stakes_clarity, curiosity_gap, scroll_stop_power) rounded to 1 decimal.
- If hard_stop_violated is true, you MUST cap the overall score at 5.0 regardless of other scores, and you MUST add the suggestion: 'Hook continues past the curiosity gap question. Everything after the question must be deleted.' to the suggestions array.
- suggestions = array of 2–3 specific rewrite suggestions if overall < ${profile.hookThreshold}, else empty array.

Here is the Phase 1 script hook to score:
"""
${narrationText}
"""`;

    const result = await this.generateStructured<LocalHookScore>(
      projectId,
      apiKey,
      modelName,
      {
        prompt,
        schema: localHookScoreSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      }
    );

    if (result.hard_stop_violated) {
      if (result.overall > 5.0) {
        result.overall = 5.0;
      }
      const suggestion = 'Hook continues past the curiosity gap question. Everything after the question must be deleted.';
      if (!result.suggestions.includes(suggestion)) {
        result.suggestions.push(suggestion);
      }
    }

    return result;
  }

  async run(
    projectId: string | null,
    narrationText: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number; scoringObjective?: string },
  ): Promise<LocalHookScore & { score_variance?: number }> {
    let profileKey = 'viral_story';
    if (projectId) {
      const project = ProjectRepository.findById(projectId);
      if (project?.content_profile) {
        profileKey = project.content_profile;
      }
    }
    const profile = resolveContentProfile(profileKey);
    const threshold = profile.hookThreshold;
    const borderlineMin = parseFloat((threshold - 0.5).toFixed(2));
    const borderlineMax = parseFloat((threshold - 0.1).toFixed(2));

    // Perform a single, initial LLM scoring pass
    const firstRun = await this.runSingle(projectId, narrationText, apiKey, modelName, config);

    // Evaluate the overall score returned from this first pass
    if (firstRun.overall >= borderlineMin && firstRun.overall <= borderlineMax) {
      // Execute the prompt two additional times in parallel
      const additionalRuns = await Promise.all([
        this.runSingle(projectId, narrationText, apiKey, modelName, config),
        this.runSingle(projectId, narrationText, apiKey, modelName, config),
      ]);

      const runs = [firstRun, ...additionalRuns];

      // Calculate medians for overall and sub-scores
      const pattern_interrupt = getMedian(runs.map(r => r.pattern_interrupt));
      const stakes_clarity = getMedian(runs.map(r => r.stakes_clarity));
      const curiosity_gap = getMedian(runs.map(r => r.curiosity_gap));
      const scroll_stop_power = getMedian(runs.map(r => r.scroll_stop_power));
      let overall = getMedian(runs.map(r => r.overall));

      // Determine hard_stop_violated by majority vote
      const hardStopViolatedCount = runs.filter(r => r.hard_stop_violated).length;
      const hard_stop_violated = hardStopViolatedCount >= 2;

      if (hard_stop_violated) {
        if (overall > 5.0) {
          overall = 5.0;
        }
      }

      // Merge and deduplicate suggestions
      const mergedSuggestions = Array.from(new Set(runs.flatMap(r => r.suggestions)));
      const hardStopSuggestion = 'Hook continues past the curiosity gap question. Everything after the question must be deleted.';
      if (hard_stop_violated && !mergedSuggestions.includes(hardStopSuggestion)) {
        mergedSuggestions.push(hardStopSuggestion);
      }

      // Sort the runs based on their overall score to identify the median run for feedback
      const sortedByOverall = [...runs].sort((a, b) => a.overall - b.overall);
      const medianRun = sortedByOverall[1];

      // Compute score variance across the 3 runs' overall scores
      const variance = getVariance(runs.map(r => r.overall));

      if (variance > 1.5) {
        const varianceSuggestion = "Score confidence is low — the hook is borderline. Consider strengthening the pattern interrupt.";
        if (!mergedSuggestions.includes(varianceSuggestion)) {
          mergedSuggestions.push(varianceSuggestion);
        }
      }

      return {
        pattern_interrupt,
        stakes_clarity,
        curiosity_gap,
        scroll_stop_power,
        hard_stop_violated,
        overall,
        feedback: medianRun.feedback,
        suggestions: mergedSuggestions,
        score_variance: parseFloat(variance.toFixed(3)),
      };
    } else {
      // Immediately return the result of the single pass
      return {
        pattern_interrupt: firstRun.pattern_interrupt,
        stakes_clarity: firstRun.stakes_clarity,
        curiosity_gap: firstRun.curiosity_gap,
        scroll_stop_power: firstRun.scroll_stop_power,
        hard_stop_violated: firstRun.hard_stop_violated,
        overall: firstRun.overall,
        feedback: firstRun.feedback,
        suggestions: firstRun.suggestions,
        score_variance: 0,
      };
    }
  }
}

export const hookScorerAgent = new HookScorerAgent();
