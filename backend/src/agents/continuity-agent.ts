import { BaseAgent } from './base-agent';
import { z } from 'zod';
import type { VeoPromptData, ProductionBibleData } from 'shared';
import { continuityAgentOutputSchema } from 'shared';

export class ContinuityAgent extends BaseAgent {
  constructor() {
    super('Continuity Agent');
  }

  async run(
    prompts: VeoPromptData[],
    bible: ProductionBibleData,
    projectId: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    isCrossPhase = false
  ): Promise<z.infer<typeof continuityAgentOutputSchema>> {
    let system = `You are the Continuity Editor for a video production pipeline.
Your job is to review a series of generated video prompts (for a single phase) and ensure they are perfectly consistent with the Production Bible.

CHECK FOR:
1. Character consistency: Age, clothing, hairstyle, and accessories must match the character roster.
2. Location consistency: Architecture style and color palette must match the location roster.
3. Visual style consistency: The prompts must align with the visual style lock.
4. CHARACTER ANACHRONISM CHECK:
For each named character who appears in this phase, check whether the historical time period of this phase's narrative content is consistent with the character's era as defined in the Production Bible character_roster.
If a character from one historical era appears in a scene whose narrative context is set in a different historical era — more than 50 years apart — flag it as a continuity warning. Note: 'The Narrator' (or any character explicitly acting as the video presenter/narrator) is exempt from this check and should never be flagged for timeline conflicts.
Warning format:
{ field: 'character_anachronism', issue: 'Character [name] (era: [character era from Bible]) appears in a scene set in [detected narrative era of this phase].', suggestion: 'Either remove [name] from this phase, replace with a period-appropriate figure, or add explicit narrative framing in an earlier phase establishing that [name] is being used as a symbolic device across time periods.' }`;

    if (isCrossPhase) {
      system = `You are the Continuity Editor for a video production pipeline.
Your job is to review the entire sequence of generated video prompts across all phases in a single pass to detect cross-phase issues. Ensure they are perfectly consistent with the Production Bible.

CHECK FOR THESE SPECIFIC CROSS-PHASE ISSUES:
1. Character appearance drift across non-adjacent phases: clothing, hairstyle, age presentation changing between phase 2 and phase 7 for example.
2. Location atmosphere drift: a location described as night in phase 3 appearing as day in phase 8 without a time-skip justification.
3. Style lock violations that only become visible across multiple phases: colour grading inconsistency, lens type switching without motivation.
4. Object continuity: a prop introduced in phase 2 disappearing without narrative explanation by phase 6.
5. CHARACTER ANACHRONISM CHECK:
Detect cases where a character introduced in one historical period reappears in a later phase set in a different period without narrative justification. Check whether the historical time period of each phase's narrative content is consistent with the character's era as defined in the Production Bible character_roster.
If a character from one historical era appears in a scene whose narrative context is set in a different historical era — more than 50 years apart — flag it as a continuity warning. Note: 'The Narrator' (or any character explicitly acting as the video presenter/narrator) is exempt from this check and should never be flagged for timeline conflicts.
Warning format:
{ field: 'character_anachronism', issue: 'Character [name] (era: [character era from Bible]) appears in a scene set in [detected narrative era of this phase].', suggestion: 'Either remove [name] from this phase, replace with a period-appropriate figure, or add explicit narrative framing in an earlier phase establishing that [name] is being used as a symbolic device across time periods.' }`;
    }

    system += `

If you find any inconsistencies, return a JSON object with a "warnings" array.
Each warning must have:
- "prompt_number": The exact "prompt_number" string value (e.g., "1", "2", "3") of the specific prompt in the input list that has the issue. You MUST set this to the exact "prompt_number" of the prompt where the inconsistency is found. Do NOT default to "1" for all warnings. Do NOT use any other number.
- "field": the field where the issue was found (e.g. "visual", "lighting", "shot")
- "issue": a short description of the continuity error
- "suggestion": how to fix the prompt to be consistent

If no issues are found, return { "warnings": [] }

Return ONLY valid JSON. No markdown formatting.`;

    const promptsForReview = prompts.map(p => ({
      prompt_number: String(p.prompt_number),
      visual: p.visual,
      shot: p.shot,
      lens: p.lens,
      lighting: p.lighting,
      camera: p.camera,
      avoid: p.avoid,
      narration: p.narration,
      dialogue: p.dialogue
    }));

    const user = `Review these prompts for continuity errors:
${JSON.stringify(promptsForReview, null, 2)}

Against this Production Bible:
${JSON.stringify({
  character_roster: bible.character_roster,
  location_roster: bible.location_roster,
  visual_style_lock: bible.visual_style_lock
}, null, 2)}`;

    return await this.generateStructured<z.infer<typeof continuityAgentOutputSchema>>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: user,
        systemInstruction: system,
        schema: continuityAgentOutputSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk
    );
  }

  async fixWarning(
    promptData: VeoPromptData,
    scene: any,
    bible: ProductionBibleData,
    warning: any,
    apiKey: string | undefined,
    modelName?: string
  ): Promise<string> {
    const fieldName = warning.field;
    const currentValue = (promptData as any)[fieldName] || '';

    const systemInstruction = `You are a surgical Continuity Fixer Agent for a video production pipeline.
Your only job is to correct the text of the single field "${fieldName}" in a video prompt to resolve a specific continuity issue.

You MUST follow these rules:
1. Rewrite ONLY the field "${fieldName}".
2. Fix the issue described by following the suggestion.
3. Keep the corrected text descriptive, natural, and matching the style of the rest of the video prompt.
4. DO NOT make any changes to any other fields. You are only outputting the new value for "${fieldName}".
5. If the field is "visual", keep the output detailed, between 40-80 words, and write all numbers as words (do not use Arabic numerals).
6. Return a JSON object matching this schema:
{
  "corrected_value": "The corrected text for the field ${fieldName}."
}`;

    // === VVS OPT FIX-1B START ===
    const styleName = bible?.visual_style_lock?.style_name || '';

    const userPrompt = `We found a continuity warning in this prompt:
- Field to fix: ${fieldName}
- Current value: "${currentValue}"
- Continuity issue: ${warning.issue}
- Suggestion to fix: ${warning.suggestion}
- Visual Style Name: ${styleName}

Rewrite the "${fieldName}" field to fix the warning. Return a JSON object with "corrected_value".`;
    // === VVS OPT FIX-1B END ===

    const result = await this.generateStructured<{ corrected_value: string }>(
      null,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction,
        schema: z.object({ corrected_value: z.string().min(1) }),
        maxRepairAttempts: 2
      }
    );

    return result.corrected_value;
  }
}

export const continuityAgent = new ContinuityAgent();
