import { buildCulturalInstruction } from '../config/culture-map';
import { COPYRIGHT_SAFE_ORIGINALITY } from './originality.constraint';

export function getConceptResearchPrompt(title: string, language: string, audience: string = ''): string {
  return `Provide a list of concrete, current, and verifiable facts about the literal subject of: "${title}".
Focus on real stages, processes, technical specifications, numbers, and actual locations.
Language is "${language}". Audience target is "${audience}".
Explain the actual technical or structural reality. Avoid clickbait or high-level summaries. Keep it under 500 words.`;
}

export function getConceptSystemPrompt(language: string = 'English', contentProfile?: string, movieConfig?: any, contentType?: string): string {
  if (contentProfile === 'cinematic_series') {
    return `You are a Cinematic Story Consultant and Creative Director.
Your job is to generate a comprehensive, highly engaging concept brief for a cinematic, episodic series or movie.

Hard rules (non-negotiable):
1. SUBJECT LOCK & PREMISE SEEDS: Build on the user's movie seeds. Ensure the premise, characters, and settings match the user's defined genre, tone, and formatting constraints.
2. Content Type Classification:
   - Set "content_type" to "narrative".
3. Topic Text Structure (Must be under 1800 characters, paste-ready, using exactly this format):
   Video Subject: [1-2 sentences summarizing the story premise]
   
   TOPICS COVERED:
   1. [Point 1: Narrative arc setup]
   2. [Point 2: Hero's introduction and stakes]
   3. [Point 3: Antagonist/threat and conflict]
   4. [Point 4: World lore and exploration detail]
   5. [Point 5: Episodic hook / build-up]
   (Add up to 7 points max)
   
   GOAL OF THE VIDEO:
   - Primary Goal: [Core narrative experience, e.g. thrill, intrigue]
   - Secondary Goals: [Pacing goals, series continuation hook, subscriber CTA]
4. Titles: Generate 10 alternative title options (e.g. episodic titles or film titles). Each title must be in "${language}". Each title must have:
   - "text": Title string
   - "angle": Angle/style used (e.g. suspense, comparison, curiosity gap)
   - "click_score": Estimated click-through score (1 to 10)
5. Engagement Blueprint: Provide a high-energy cinematic tension skeleton:
   - "core_curiosity_question": The main dramatic question of the episode or series
   - "hook_strategy": How the first 10-15 seconds will hook the viewer with action/mystery
   - "open_loops": A list of 3-4 specific narrative loops, secrets, or setups to plant
   - "escalation_logic": How the dramatic tension/climax builds phase-by-phase
   - "emotional_driver": The core emotion (wonder, dread, heroism, suspense)
   - "payoff": The ultimate resolution or cliffhanger payoff
6. Thumbnail Concept:
   - "thumbnail_concept": ONE sentence describing a cinematic high-CTR thumbnail — focal character, dynamic lighting/composition, dominant emotion.
7. Keywords:
   - "keywords": an array of 8-12 search tags.

${COPYRIGHT_SAFE_ORIGINALITY}

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "content_type": "narrative",
  "project_topic": "string",
  "titles": [
    {
      "text": "string",
      "angle": "string",
      "click_score": 9
    }
  ],
  "engagement_blueprint": {
    "core_curiosity_question": "string",
    "hook_strategy": "string",
    "open_loops": ["string"],
    "escalation_logic": "string",
    "emotional_driver": "string",
    "payoff": "string"
  },
  "target_audience": "string",
  "suggested_length": "string",
  "thumbnail_concept": "string",
  "keywords": ["string"]
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`;
  }

  let modeInstruction = '';
  if (!contentProfile || contentProfile === 'auto') {
    modeInstruction = `[STRICT CREATIVE CONTRACT - AUTO MODE]:
- You MUST auto-select both the most appropriate "content_profile" and "content_type" based on the title seed and topic.
- For "content_profile", select from: 'viral_story', 'documentary', 'tutorial', 'listicle', 'narrative_fiction', 'cinematic_series', 'industry_profile', 'product_showcase', 'episodic_animated_story', 'kids_educational_story', 'historical_deep_dive', 'vlog_day_in_life'.
- For "content_type", select from: 'documentary', 'narrative', 'presenter', 'montage'.
- In your JSON output, you MUST include the "content_profile" field set to your selected profile key, and "content_type" set to your selected type.`;
  } else if (contentType === 'auto' || !contentType) {
    modeInstruction = `[STRICT CREATIVE CONTRACT - SEMI-AUTO MODE]:
- The "content_profile" is locked to "${contentProfile}". You MUST set "content_profile": "${contentProfile}" in your JSON output.
- You MUST auto-select the most appropriate "content_type" from: 'documentary', 'narrative', 'presenter', 'montage'.
- In your JSON output, set the "content_type" field to your selected type.`;
  } else {
    modeInstruction = `[STRICT CREATIVE CONTRACT - MANUAL MODE]:
- The "content_profile" is locked to "${contentProfile}". You MUST set "content_profile": "${contentProfile}" in your JSON output.
- The "content_type" is locked to "${contentType}". You MUST set "content_type": "${contentType}" in your JSON output. Do NOT classify or change these selections.`;
  }

  return `You are a YouTube Content Strategist and Research Producer.
Your job is to generate a comprehensive, highly engaging concept brief based on a video title seed.

${modeInstruction}

Hard rules (non-negotiable):
1. SUBJECT LOCK: Stay 100% focused on the literal subject of the video title. Do not drift to general or abstract concepts. Keep descriptions grounded in the physical reality of the subject.
2. GEOGRAPHIC FIDELITY: If the Title Seed names or implies a specific country, region, nationality, or locale (e.g. भारत/India, USA, Japan), preserve that exact geography for the subject, locations, examples, and named entities. NEVER substitute a more famous example from a different country. The narration-language cultural setting below is only a DEFAULT for when the seed has no inherent geography, and it must NOT override an explicit seed geography.
3. Content Type Classification:
   - "documentary" (default for process, tour, science, explainer videos; 0 recurring characters)
   - "narrative" (story with 1-5 characters)
   - "presenter" (talking-head with exactly 1 host)
   - "montage" (voiceover + B-roll-driven structure, zero required characters)
4. Topic Text Structure (Must be under 1800 characters, paste-ready, using exactly this format):
   Video Subject: [1-2 sentences summarizing the topic]
   
   TOPICS COVERED:
   1. [Point 1 description]
   2. [Point 2 description]
   3. [Point 3 description]
   4. [Point 4 description]
   5. [Point 5 description]
   (Add up to 7 points max)
   
   GOAL OF THE VIDEO:
   - Primary Goal: [Core objective, e.g. teach, inspire]
   - Secondary Goals: [Metrics, retention focus, subscriber CTA]
5. Titles: Generate 10 alternative title options. Each title must be in "${language}"; if it uses a non-Latin script, also provide Roman/transliterated variants (e.g. Hinglish for Hindi). Each title must have:
   - "text": Title string
   - "angle": Angle/style used (e.g. suspense, comparison, curiosity gap)
   - "click_score": Estimated click-through score (1 to 10)
6. Engagement Blueprint: Provide a viral engagement skeleton:
   - "core_curiosity_question": The main question that MUST be answered by the end
   - "hook_strategy": How the first 10-15 seconds will capture attention
   - "open_loops": A list of 3-4 specific curiosity loops or questions to plant
   - "escalation_logic": How the tension/pacing builds phase-by-phase
   - "emotional_driver": The core emotion (wonder, fear, curiosity, anger)
   - "payoff": The ultimate payoff/resolution
7. Thumbnail Concept:
   - "thumbnail_concept": ONE sentence describing a high-CTR thumbnail — focal subject, composition, dominant emotion, and any short on-image text. Write it in "${language}"; if it uses a non-Latin script, on-image text may be in Roman/transliterated script.
8. Keywords:
   - "keywords": an array of 8-12 SEO search terms/tags ordered most-searched first. MUST mix: (a) target-language terms, and (b) if it uses a non-Latin script, BOTH the native script AND Roman/transliterated variants (the way people type the search). No duplicates.

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "content_type": "${contentType && contentType !== 'auto' ? contentType : 'documentary/narrative/presenter/montage'}",
  "content_profile": "${contentProfile && contentProfile !== 'auto' ? contentProfile : 'viral_story/documentary/tutorial/listicle/narrative_fiction/cinematic_series/industry_profile/product_showcase/episodic_animated_story/kids_educational_story/historical_deep_dive/vlog_day_in_life'}",
  "project_topic": "string",
  "titles": [
    {
      "text": "string",
      "angle": "string",
      "click_score": 9
    }
  ],
  "engagement_blueprint": {
    "core_curiosity_question": "string",
    "hook_strategy": "string",
    "open_loops": ["string"],
    "escalation_logic": "string",
    "emotional_driver": "string",
    "payoff": "string"
  },
  "target_audience": "string",
  "suggested_length": "string",
  "thumbnail_concept": "string",
  "keywords": ["string"]
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`;
}

export function getConceptUserPrompt(
  title: string,
  language: string,
  region: string = 'auto',
  audience: string = '',
  length: string = '',
  groundedFacts?: string | null,
  contentProfile?: string,
  movieConfig?: any,
  contentType?: string
): string {
  if (contentProfile === 'cinematic_series') {
    let prompt = `Create a Cinematic Concept Brief for this project:

Title Seed: "${title}"
Language  : "${language}"
Audience  : "${audience || 'General public'}"
Length    : "${length || 'auto'}"`;

    if (movieConfig) {
      prompt += `\n\nMOVIE CONFIGURATION SEEDS:
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

    if (groundedFacts && groundedFacts.trim().length > 0) {
      prompt += `\n\nVERIFIED FACTS (prefer these; do not contradict):\n"""\n${groundedFacts}\n"""`;
    }

    prompt += `\n\nRequirements:
- Integrate the movie configuration seeds deeply into the concept brief.
- Ensure the project_topic is a comprehensive cinematic overview formatted as:
  Video Subject: ...
  TOPICS COVERED: ...
  GOAL OF THE VIDEO: ...
- Write all other fields in ENGLISH (Latin script).`;

    const cultural = buildCulturalInstruction(language, region);
    if (cultural) {
      prompt += `\n\n${cultural}`;
    }

    return prompt.trim();
  }

  let prompt = `Create a Concept Brief for this project:

Title Seed: "${title}"
Language  : "${language}"
Audience  : "${audience || 'General public'}"
Length    : "${length || 'auto'}"`;

  if (groundedFacts && groundedFacts.trim().length > 0) {
    prompt += `\n\nVERIFIED FACTS (prefer these; do not contradict):\n"""\n${groundedFacts}\n"""`;
  }

  prompt += `\n\nRequirements:
- Output 10 titles in "${language}" (if it uses a non-Latin script, use natural spoken Roman/transliterated variants, e.g. Hinglish for Hindi).
- Ensure the project_topic is a comprehensive overview formatted as:
  Video Subject: ...
  TOPICS COVERED: ...
  GOAL OF THE VIDEO: ...
- Write all other fields in ENGLISH (Latin script).`;

  if (contentType && contentType !== 'auto') {
    prompt += `\n- The Content Type is locked to: "${contentType}". You MUST set "content_type": "${contentType}" in the output.`;
  }
  if (contentProfile && contentProfile !== 'auto') {
    prompt += `\n- The Content Profile is locked to: "${contentProfile}". You MUST set "content_profile": "${contentProfile}" in the output.`;
  }

  const cultural = buildCulturalInstruction(language, region);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}

export function getConceptTopicOnlyPrompt(
  title: string,
  chosenTitle: string,
  language: string,
  region: string = 'auto',
  audience: string = '',
  groundedFacts?: string | null,
  contentProfile?: string,
  movieConfig?: any,
  contentType?: string
): string {
  if (contentProfile === 'cinematic_series') {
    let prompt = `Generate a revised topic, content type, and engagement blueprint specifically tailored to the chosen cinematic title: "${chosenTitle}" (original seed was "${title}").

Language  : "${language}"
Audience  : "${audience || 'General public'}"`;

    if (movieConfig) {
      prompt += `\n\nMOVIE CONFIGURATION SEEDS:
- Format: ${movieConfig.format}
- Genre: ${movieConfig.genre}
- Tone: ${Array.isArray(movieConfig.tone) ? movieConfig.tone.join(', ') : movieConfig.tone}
- Hero Idea: "${movieConfig.hero_idea || ''}"
- Villain/Threat Idea: "${movieConfig.villain_idea || ''}"
- World/Setting Idea: "${movieConfig.world_idea || ''}"`;
      if (movieConfig.creature_idea) {
        prompt += `\n- Creature/Monster Idea: "${movieConfig.creature_idea}"`;
      }
    }

    if (groundedFacts && groundedFacts.trim().length > 0) {
      prompt += `\n\nVERIFIED FACTS (prefer these; do not contradict):\n"""\n${groundedFacts}\n"""`;
    }

    prompt += `\n\nEnsure that the content_type is "narrative" and project_topic, and engagement_blueprint are tightly aligned with the specific cinematic angle of the title: "${chosenTitle}".
Format project_topic exactly as required (Video Subject + TOPICS COVERED + GOAL).
Return ONLY raw JSON with these fields:
{
  "content_type": "narrative",
  "project_topic": "string",
  "engagement_blueprint": {
    "core_curiosity_question": "string",
    "hook_strategy": "string",
    "open_loops": ["string"],
    "escalation_logic": "string",
    "emotional_driver": "string",
    "payoff": "string"
  }
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`;

    const cultural = buildCulturalInstruction(language, region);
    if (cultural) {
      prompt += `\n\n${cultural}`;
    }

    return prompt.trim();
  }

  let modeInstruction = '';
  if (!contentProfile || contentProfile === 'auto') {
    modeInstruction = `- You MUST auto-select both the most appropriate "content_profile" and "content_type" based on the title.
- For "content_profile", select from: 'viral_story', 'documentary', 'tutorial', 'listicle', 'narrative_fiction', 'cinematic_series', 'industry_profile', 'product_showcase', 'episodic_animated_story', 'kids_educational_story', 'historical_deep_dive', 'vlog_day_in_life'.
- For "content_type", select from: 'documentary', 'narrative', 'presenter', 'montage'.`;
  } else if (contentType === 'auto' || !contentType) {
    modeInstruction = `- The "content_profile" is locked to "${contentProfile}". Set "content_profile": "${contentProfile}".
- You MUST auto-select the most appropriate "content_type" from: 'documentary', 'narrative', 'presenter', 'montage'.`;
  } else {
    modeInstruction = `- The "content_profile" is locked to "${contentProfile}". Set "content_profile": "${contentProfile}".
- The "content_type" is locked to "${contentType}". Set "content_type": "${contentType}".`;
  }

  let prompt = `Generate a revised topic, content type, and engagement blueprint specifically tailored to the chosen title: "${chosenTitle}" (original seed was "${title}").

Language  : "${language}"
Audience  : "${audience || 'General public'}"`;

  if (groundedFacts && groundedFacts.trim().length > 0) {
    prompt += `\n\nVERIFIED FACTS (prefer these; do not contradict):\n"""\n${groundedFacts}\n"""`;
  }

  prompt += `\n\nEnsure that the content_type, project_topic, and engagement_blueprint are tightly aligned with the specific angle and hook of the chosen title: "${chosenTitle}".
${modeInstruction}
Format project_topic exactly as required (Video Subject + TOPICS COVERED + GOAL).
Return ONLY raw JSON with these fields:
{
  "content_type": "${contentType && contentType !== 'auto' ? contentType : 'documentary/narrative/presenter/montage'}",
  "content_profile": "${contentProfile && contentProfile !== 'auto' ? contentProfile : 'viral_story/documentary/tutorial/listicle/narrative_fiction/cinematic_series/industry_profile/product_showcase/episodic_animated_story/kids_educational_story/historical_deep_dive/vlog_day_in_life'}",
  "project_topic": "string",
  "engagement_blueprint": {
    "core_curiosity_question": "string",
    "hook_strategy": "string",
    "open_loops": ["string"],
    "escalation_logic": "string",
    "emotional_driver": "string",
    "payoff": "string"
  }
}
Return ONLY raw JSON — no markdown fences, no prose before or after.`;

  const cultural = buildCulturalInstruction(language, region);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}

export function getStyleSelectionPrompt(
  brief: any,
  contentType: string,
  language: string,
  existingStyles: { id: string; name: string; description: string; render_family?: string | null }[],
  profileDefaultKey?: string,
  region: string = 'auto'
): string {
  const stylesList = existingStyles.map((s, idx) => `${idx + 1}. ID: "${s.id}" • Name: "${s.name}" • Family: "${s.render_family || 'unknown'}" • Description: "${s.description}"`).join('\n');

  let prompt = `You are a senior cinematographer and AI video art director for Google Veo 3.1.
Your task is to select a visual style for the project brief, matching it against our existing style library (which includes premium curated styles first) or designing a new one.

PROJECT BRIEF DETAILS:
- Subject/Topic: ${brief.project_topic}
- Content Type: ${contentType}
- Core Curiosity: ${brief.engagement_blueprint?.core_curiosity_question || ''}
- Emotional Driver: ${brief.engagement_blueprint?.emotional_driver || ''}
- Narration Language: ${language}`;

  if (profileDefaultKey) {
    prompt += `\n- SOFT PRIOR REFERENCE: There is a preferred preset for this project: "${profileDefaultKey}". Please strongly prefer matching or adapting this style (or a style within its family) unless the topic or narrative style clearly dictates a different approach.`;
  }

  prompt += `\n\nEXISTING STYLE LIBRARY (PREMIUM CANONICAL CORE & CUSTOM LIBRARY):
${stylesList || 'None (library is empty)'}

DECISION RULE & MATCHING INSTRUCTIONS:
1. First, search the library carefully. If one of the existing library styles matches this brief's aesthetic needs perfectly, select it. Curated core styles should always be preferred over custom database styles to ensure high-fidelity Veo rendering.
2. HARD MATCHING RULES:
   - (a) Judge candidate styles on AESTHETIC and TECHNIQUE only (lighting style, lens family, film stock grade, color temperature, camera movement language, color palette/mood).
   - (b) Inspect the FULL description of each candidate style, not just the style name.
   - (c) NEVER select an existing style if its description contains subject-specific or environment-specific nouns/details that are irrelevant to or incompatible with the new brief's topic (e.g. do not select a style referencing ships, ocean, ballast tanks, water, or containers if the new project is about an aerospace factory or cleanroom, and vice versa).
3. Only if no existing style fits the required aesthetic under these rules, design a new visual style tailored to this topic.

If selecting an EXISTING style, output:
{
  "mode": "existing",
  "existing_style_id": "matched_style_id",
  "reasoning": "Explain why this style is a strong fit."
}

If creating a NEW style, you MUST specify the most appropriate "render_family" from this enum:
[
  "photoreal_cinematic",
  "documentary_realism",
  "stylized_3d",
  "pixar_3d",
  "claymation_stopmotion",
  "anime_2d",
  "painterly_watercolor",
  "comic_graphic_novel",
  "flat_2d_vector",
  "motion_graphics",
  "pixel_art"
]

Output when creating a NEW style:
{
  "mode": "new",
  "name": "A short descriptive name (e.g. 'Neo-Noir Cyberpunk Explainer')",
  "render_family": "one of the render family enum values listed above",
  "description": "A single, highly detailed, Google Veo-3.1-ready style description paragraph (120 to 300 words). Explicitly detail: (1) Render style: e.g. photorealistic live-action cinematic / 2D vector animation / claymation. (2) Color palette (3 to 5 concrete hex or color names) + color mood. (3) Lighting style (source, direction, temperature in Kelvin, quality). (4) Camera movement style. (5) Lens family + film stock grade/grain. (6) Comma-separated veo_style_tokens. (7) Forbidden elements. Keep the style consistent shot-to-shot. Describe motion video, not static images. Do not mention copyrighted franchises.\n  HARD RULE FOR NEW STYLES: The description MUST be completely SUBJECT-AGNOSTIC. Detail aesthetic, color, camera, lens, and technique parameters only. Do NOT include any subject-specific nouns, locations, characters, vehicles, or objects (e.g. do not reference 'ship', 'ocean', 'plane', 'factory', 'engine', 'cockpit', etc.) so that the style description can be safely reused for other subjects without leaking.",
  "veo_style_tokens": ["token1", "token2", "token3"],
  "reasoning": "Explain why a new style was needed."
}

Ensure the output is STRICT JSON matching the schema.`;

  const cultural = buildCulturalInstruction(language, region);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}
