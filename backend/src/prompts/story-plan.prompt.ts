import { buildCulturalInstruction } from '../config/culture-map';
import type { ContentProfileConfig } from 'shared';
import { COPYRIGHT_SAFE_ORIGINALITY } from './originality.constraint';

export function getStoryPlanSystemPrompt(profile: ContentProfileConfig): string {
  if (profile.id === 'cinematic_series') {
    return `You are the Cinematic Story Planner Agent for a high-end film and episodic series production pipeline.
Your job is to outline the movie/series story structure, logline, core conflicts, and draft character, location, and object rosters.

Hard rules (non-negotiable):
1. Story Outline  ➔ Provide a clear, engaging paragraph describing the overarching narrative arc, hook, buildup, climax, and payoff. Match the tone and style of: "${profile.scoringObjective}".
2. Characters ➔ Output heroes, villains, and creatures/monsters in the "character_list".
   - For every character/creature, include "character_type" (either 'hero', 'villain', or 'creature').
3. Locations ➔ Output key locations, worlds, and settings in the "location_list".
4. Objects ➔ Output key objects, weapons, and artifacts in the "object_list".
5. Movie Structure ➔ Provide a detailed cinematic breakdown in the "raw_json" field.

${COPYRIGHT_SAFE_ORIGINALITY}

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "story_outline": "string",
  "video_type": "narrative",
  "character_list": [
    {
      "name": "string",
      "concept": "string",
      "character_type": "hero | villain | creature"
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
  ],
  "raw_json": {
    "logline": "string",
    "core_conflict": "string",
    "hero_journey": "string",
    "villain_threat_arc": "string",
    "world_concept": "string",
    "factions": ["string"],
    "creatures_monsters": ["string"],
    "key_locations": ["string"],
    "key_objects_weapons": ["string"],
    "season_direction": "string",
    "action_intensity": 9,
    "world_exploration": 9,
    "estimated_runtime": "string",
    "scene_count": 12
  }
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`.trim();
  }

  return `You are the Story Planner Agent for an AI video production pipeline.
Your job is to outline the video story structure and draft high-level character, location, and object rosters before the production bible or script is generated.

RULES (non-negotiable):
1. Story Outline  ➔ Provide a clear, engaging paragraph describing the overarching narrative arc, hook, buildup, climax, and payoff. Match the tone of: "${profile.scoringObjective}".
2. Characters (OPTIONAL — only if the story genuinely needs recurring people):
   - Resolve the video type. The user may specify it; if it is "auto", YOU classify it as one of: narrative, documentary, presenter, montage.
   - narrative  → 1–5 characters.
   - documentary/explainer/montage → 0 characters in almost all cases (factory tours, product/science/data, nature, "how X works") UNLESS the documentary features recurring anonymous human operators or workers across multiple scenes. In those cases, you may identify recurring ANONYMOUS archetypal ROLES (e.g. "Market Vendor", "Dock Worker", "Truck Driver") to maintain visual consistency. Do NOT invent named or specific real individuals, and use generic role-based names only. If the documentary has no people (e.g. pure product, science, data, or nature), keep the character_list empty. Put the primary richness in locations, objects, and the process/sequence; archetypes are strictly supplementary.
   - presenter/talking-head → EXACTLY 1 character: the on-screen narrator/host.
   - montage → voiceover + B-roll-driven structure, ZERO required characters.
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
  profile?: ContentProfileConfig,
  movieConfig?: any,
  targetDurationMinutes?: number,
  region: string = 'auto'
): string {
  if (profile?.id === 'cinematic_series') {
    let prompt = `Create a Cinematic Story Plan for this project:

Topic / Theme : "${topic}"
Visual Style  : "${visualStyle}"
Language      : "${language}"
Aspect Ratio  : "${aspectRatio}"
Video Type    : "narrative"
Content Profile: "cinematic_series"`;

    if (movieConfig) {
      prompt += `\n\nUSER PREMISE & STORY SEEDS:
- Format: ${movieConfig.format}
- Genre: ${movieConfig.genre}
- Tone: ${Array.isArray(movieConfig.tone) ? movieConfig.tone.join(', ') : movieConfig.tone}
- Story Engine Focus: ${movieConfig.story_engine_focus ? JSON.stringify(movieConfig.story_engine_focus) : 'none'}
- Hero Idea: "${movieConfig.hero_idea || ''}"
- Villain/Threat Idea: "${movieConfig.villain_idea || ''}"
- World/Setting Idea: "${movieConfig.world_idea || ''}"`;
      if (movieConfig.creature_idea) {
        prompt += `\n- Creature/Monster Idea: "${movieConfig.creature_idea}"`;
      }
    }

    prompt += `\n\nRequirements:
- Plan the episodic or film narrative arc using the "${profile?.arcTemplate || '7-act-episodic'}" structure.
- Grounds the story plan deeply in the provided Hero, Villain, World, and Creature/Monster ideas.
- Output the detailed cinematic structure in the "raw_json" object.
- Estimated Runtime MUST match the target duration of ${targetDurationMinutes || 10} minutes. Do not free-invent a feature film runtime (like 120 minutes) if the target duration is shorter.
- The scene_count in raw_json must be grounded in this target duration (e.g. roughly 1-2 scenes per minute of screen time, meaning around ${Math.ceil((targetDurationMinutes || 10) * 1.5)} scenes).
- GEOGRAPHIC CONSISTENCY RULE (HARD RULE): Ensure all locations and scenes follow a plausible, logically sequenced real-world journey. Do NOT present far-apart geographic locations (e.g. Zoji La Pass in Ladakh vs Kishtwar Road in Jammu) as adjacent or consecutive parts of a single drive without explaining long travel. Keep named routes, regions, and passes consistent.
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
- Payoff (resolve by the outro): ${engagementBlueprint.payoff}`;
    }

    const cultural = buildCulturalInstruction(language, region);
    if (cultural) {
      prompt += `\n\n${cultural}`;
    }

    return prompt.trim();
  }

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
- If Video Type is 'auto', classify it yourself and return it in video_type. Otherwise honor it exactly (e.g. 'montage' means a voiceover + B-roll-driven structure with zero required characters).
- Ensure characters, locations, and objects directly match the requested theme.
- GEOGRAPHIC CONSISTENCY RULE (HARD RULE): Ensure all locations and scenes follow a plausible, logically sequenced real-world journey. Do NOT present far-apart geographic locations (e.g. Zoji La Pass in Ladakh vs Kishtwar Road in Jammu) as adjacent or consecutive parts of a single drive without explaining long travel. Keep named routes, regions, and passes consistent.
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

  const cultural = buildCulturalInstruction(language, region);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}
