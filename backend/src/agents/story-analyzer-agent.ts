import { BaseAgent } from './base-agent';
import { storyAnalysisSchema } from 'shared';
import type { StoryAnalysisData } from 'shared';

export class StoryAnalyzerAgent extends BaseAgent {
  constructor() {
    super('StoryAnalyzerAgent');
  }

  /**
   * Evaluates the full script phases to predict the retention curve and emotional peaks.
   */
  async analyze(
    projectId: string,
    narrationPhases: { phase_number: number; phase_title: string; narration_text: string }[],
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number; scoringObjective?: string },
    onChunk?: (chunk: string) => void
  ): Promise<StoryAnalysisData> {
    const phaseCount = narrationPhases.length;
    const objective = config?.scoringObjective || 'You are a YouTube retention analysis expert.';
    const systemPrompt = `${objective} Analyze the provided ${phaseCount}-phase video script and return a retention curve prediction and phase-by-phase analysis.
For each of the ${phaseCount} phases score:
- retention_score (1–10): predicted % of viewers still watching at the END of this phase (10 = 95%+, 1 = <30%)
- hook_density (1–10): how many curiosity-sustaining elements or new reveals are in this phase
- emotional_intensity (1–10): emotional engagement level (tension, awe, empathy, humor, shock)
- rehook_present (boolean): does this phase contain a re-engagement beat (new question, revelation, or stakes escalation)?
Also return:
- overall_retention_score (number 1–10): predicted average watch duration as a percentage score
- dropout_risk_phases (number[]): phase numbers where viewer dropout risk is highest (retention_score < 5)
- peak_moment_phase (number): the single phase with the highest emotional intensity
- summary (string): 2-sentence overall retention assessment.
Return ONLY valid JSON:
{ 'phase_analyses': [{ 'phase_number': number, 'retention_score': number, 'hook_density': number, 'emotional_intensity': number, 'rehook_present': boolean }], 'overall_retention_score': number, 'dropout_risk_phases': number[], 'peak_moment_phase': number, 'summary': string }`;

    const userPrompt = `Here is the video script structure with all ${phaseCount} phases:
${narrationPhases.map(p => `
Phase ${p.phase_number}: "${p.phase_title}"
Narration: "${p.narration_text}"
`).join('\n')}`;

    return await this.generateStructured<StoryAnalysisData>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: storyAnalysisSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk
    );
  }
}

export const storyAnalyzerAgent = new StoryAnalyzerAgent();
