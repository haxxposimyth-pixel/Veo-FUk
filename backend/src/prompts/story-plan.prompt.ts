import { buildCulturalInstruction } from '../config/culture-map';
import type { ContentProfileConfig } from 'shared';

export function getStoryPlanSystemPrompt(profile: ContentProfileConfig): string {
  return `You are the Story Planner Agent for an AI video production pipeline.
Your job is to outline the video story structure and draft high-level character, location, and object rosters before the production bible or script is generated.

RULES (non-negotiable):
1. Story Outline  ➔ Provide a clear, engaging paragraph describing the overarching narrative arc, hook, buildup, climax, and payoff. Match the tone of: "${profile.scoringObjective}".
2. Characters (OPTIONAL — only if the story genuinely needs recurring people):
   - Resolve the video type. The user may specify it; if it is "auto", YOU classify it as one of: narrative, documentary, presenter.
   - narrative  → 1–5 characters.
   - documentary/explainer → 0 characters in almost all cases (factory tours, product/science/data, nature, "how X works"). Do NOT invent people. Put the richness into locations, objects, and the process/sequence instead.
   - presenter/talking-head → EXACTLY 1 character: the on-screen narrator/host.
   - Output the resolved type in a top-level "video_type" field.
3. Locations ➔ 2–8 entries.
4. Objects ➔ 1–6 entries.
5. Cultural Consistency ➔ Characters, locations, and objects MUST match the cultural region specified in the user prompt (if any). Names must be in Latin script.

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "story_outline": "string",
  "video_type": "documentary",
  "character_list": [
    {
      "name": "string",
      "concept": "string"
    }
  ],
  "location_list": [
    {
      "name": "string",
      "concept": "string"
    }
  ],
  "object_list": [
    {
      "name": "string",
      "concept": "string"
    }
  ]
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`.trim();
}

export function getStoryPlanUserPrompt(
  topic: string,
  visualStyle: string,
  language: string,
  aspectRatio: string,
  youtubeTranscript?: string,
  contentType: string = 'auto',
  engagementBlueprint?: any,
  profile?: ContentProfileConfig
): string {
  let prompt = `Create a Story Plan for this project:

Topic / Theme : "${topic}"
Visual Style  : "${visualStyle}"
Language      : "${language}"
Aspect Ratio  : "${aspectRatio}"
Video Type    : "${contentType}"
Content Profile: "${profile?.id || 'default'}"

Requirements:
- Plan the story arc using the "${profile?.arcTemplate || '5-act-viral'}" structure.
- Engagement Intensity must be: ${profile?.engagementIntensity || 'high'}.
- If Video Type is 'auto', classify it yourself and return it in video_type. Otherwise honor it exactly.
- Ensure characters, locations, and objects directly match the requested theme.
- Write ALL text (story_outline, character names, concepts, locations, objects) in ENGLISH (Latin script). The "${language}" value is the NARRATION language only and must NOT change the language of this plan.`;

  if (youtubeTranscript) {
    prompt += `\n\nReference YouTube Transcript (extract key themes, facts, and structure from this transcript):\n"""\n${youtubeTranscript}\n"""`;
  }

  if (engagementBlueprint) {
    prompt += `\n\nENGAGEMENT BLUEPRINT (build every phase to honor this):
- Core Curiosity Question: ${engagementBlueprint.core_curiosity_question}
- Hook Strategy: ${engagementBlueprint.hook_strategy}
- Open Loops (seed early, pay off later): ${JSON.stringify(engagementBlueprint.open_loops)}
- Escalation Logic: ${engagementBlueprint.escalation_logic}
- Emotional Driver: ${engagementBlueprint.emotional_driver}
- Payoff (resolve by the outro): ${engagementBlueprint.payoff}

Instructions:
* Structure the scenes and phases so they explicitly seed the open loops in early phases (e.g. Phase 2-4) and resolve/pay them off in the climax/outro.
* Ensure the emotional driver is integrated into the narrative arc.`;
  }

  const cultural = buildCulturalInstruction(language);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}
