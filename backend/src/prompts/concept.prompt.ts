import { buildCulturalInstruction } from '../config/culture-map';

export function getConceptResearchPrompt(title: string, language: string, audience: string = ''): string {
  return `Provide a list of concrete, current, and verifiable facts about the literal subject of: "${title}".
Focus on real stages, processes, technical specifications, numbers, and actual locations.
Language is "${language}". Audience target is "${audience}".
Explain the actual technical or structural reality. Avoid clickbait or high-level summaries. Keep it under 500 words.`;
}

export function getConceptSystemPrompt(language: string = 'English'): string {
  return `You are a YouTube Content Strategist and Research Producer.
Your job is to generate a comprehensive, highly engaging concept brief based on a video title seed.

Hard rules (non-negotiable):
1. SUBJECT LOCK: Stay 100% focused on the literal subject of the video title. Do not drift to general or abstract concepts. Keep descriptions grounded in the physical reality of the subject.
2. Content Type Classification:
   - "documentary" (default for process, tour, science, explainer videos; 0 recurring characters)
   - "narrative" (story with 1-5 characters)
   - "presenter" (talking-head with exactly 1 host)
3. Topic Text Structure (Must be under 1800 characters, paste-ready, using exactly this format):
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
4. Titles: Generate 10 alternative title options. Each title must be in "${language}"; if it uses a non-Latin script, also provide Roman/transliterated variants (e.g. Hinglish for Hindi). Each title must have:
   - "text": Title string
   - "angle": Angle/style used (e.g. suspense, comparison, curiosity gap)
   - "click_score": Estimated click-through score (1 to 10)
5. Engagement Blueprint: Provide a viral engagement skeleton:
   - "core_curiosity_question": The main question that MUST be answered by the end
   - "hook_strategy": How the first 10-15 seconds will capture attention
   - "open_loops": A list of 3-4 specific curiosity loops or questions to plant
   - "escalation_logic": How the tension/pacing builds phase-by-phase
   - "emotional_driver": The core emotion (wonder, fear, curiosity, anger)
   - "payoff": The ultimate payoff/resolution
6. Thumbnail Concept:
   - "thumbnail_concept": ONE sentence describing a high-CTR thumbnail — focal subject, composition, dominant emotion, and any short on-image text. Write it in "${language}"; if it uses a non-Latin script, on-image text may be in Roman/transliterated script.
7. Keywords:
   - "keywords": an array of 8-12 SEO search terms/tags ordered most-searched first. MUST mix: (a) target-language terms, and (b) if it uses a non-Latin script, BOTH the native script AND Roman/transliterated variants (the way people type the search). No duplicates.

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "content_type": "documentary",
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
  audience: string = '',
  length: string = '',
  groundedFacts?: string | null
): string {
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

  const cultural = buildCulturalInstruction(language);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}

export function getConceptTopicOnlyPrompt(
  title: string,
  chosenTitle: string,
  language: string,
  audience: string = '',
  groundedFacts?: string | null
): string {
  let prompt = `Generate a revised topic, content type, and engagement blueprint specifically tailored to the chosen title: "${chosenTitle}" (original seed was "${title}").

Language  : "${language}"
Audience  : "${audience || 'General public'}"`;

  if (groundedFacts && groundedFacts.trim().length > 0) {
    prompt += `\n\nVERIFIED FACTS (prefer these; do not contradict):\n"""\n${groundedFacts}\n"""`;
  }

  prompt += `\n\nEnsure that the content_type, project_topic, and engagement_blueprint are tightly aligned with the specific angle and hook of the chosen title: "${chosenTitle}".
Format project_topic exactly as required (Video Subject + TOPICS COVERED + GOAL).
Return ONLY raw JSON with these fields:
{
  "content_type": "documentary",
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

  const cultural = buildCulturalInstruction(language);
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
  profileDefaultKey?: string
): string {
  const stylesList = existingStyles.map((s, idx) => `${idx + 1}. ID: "${s.id}" • Name: "${s.name}" • Family: "${s.render_family || 'unknown'}" • Description: "${s.description.slice(0, 200)}..."`).join('\n');

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

DECISION RULE:
1. First, search the library carefully. If one of the existing library styles matches this brief's aesthetic needs perfectly, select it. Curated core styles should always be preferred over custom database styles to ensure high-fidelity Veo rendering.
2. Only if no existing style fits the required aesthetic, design a new visual style tailored to this topic.

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
  "description": "A single, highly detailed, Google Veo-3.1-ready style description paragraph (120 to 300 words). Explicitly detail: (1) Render style: e.g. photorealistic live-action cinematic / 2D vector animation / claymation. (2) Color palette (3 to 5 concrete hex or color names) + color mood. (3) Lighting style (source, direction, temperature in Kelvin, quality). (4) Camera movement style. (5) Lens family + film stock grade/grain. (6) Comma-separated veo_style_tokens. (7) Forbidden elements. Keep the style consistent shot-to-shot. Describe motion video, not static images. Do not mention copyrighted franchises.",
  "veo_style_tokens": ["token1", "token2", "token3"],
  "reasoning": "Explain why a new style was needed."
}

Ensure the output is STRICT JSON matching the schema.`;

  const cultural = buildCulturalInstruction(language);
  if (cultural) {
    prompt += `\n\n${cultural}`;
  }

  return prompt.trim();
}


