import { VisualStyleLock, SCENE_DURATION_SECONDS } from 'shared';
import type { ContentProfileConfig } from 'shared';

export const getVeoSystemPrompt = (project: any, bible: any, profile?: ContentProfileConfig): string => {
  const cameraEnergy = profile?.cameraEnergy || 'dynamic';
  const cameraVocabulary = cameraEnergy === 'calm' 
    ? 'Static | Very slow push in | Very slow pull back | Locked-off pan'
    : cameraEnergy === 'standard' 
      ? 'Static | Slow push in | Slow pull back | Pan left | Pan right | Tilt up | Tilt down | Tracking shot | Dolly in | Dolly out | Rack focus'
      : 'Static | Slow push in | Slow pull back | Pan left | Pan right | Tilt up | Tilt down | Tracking shot | Handheld | Crane up | Crane down | Dolly in | Dolly out | Whip pan | Rack focus';

  const aspectRatio = project?.aspect_ratio || '16:9';

  const dynamicContext = `
  PROJECT CONTEXT (APPLY TO EVERY SCENE):
  Topic: ${project.topic}
  Visual Style: ${project.visual_style}
  Narration Language: ${project.narration_language}
  Aspect Ratio: ${aspectRatio}
  
  LANGUAGE RULE: ALL prompt fields (Visual, Subject lock, Shot, Lens, Lighting, Camera, Ambient Sound, SFX, Avoid, Connection) MUST be in ENGLISH. ONLY the spoken content of the Narration/Dialogue line is in ${project.narration_language}. Never output non-Latin script in any field except the Narration/Dialogue line.
  
  PRODUCTION BIBLE LOCKS:
  Visual Style Lock: ${JSON.stringify(bible.visual_style_lock || {})}
  Color Palette: ${(bible.visual_style_lock?.color_palette || []).join(', ')}
  Color Mood: ${bible.visual_style_lock?.color_mood || ''}
  Camera Movement Style: 
    ${bible.visual_style_lock?.camera_movement_style || ''}
  Lighting Style: 
    ${bible.visual_style_lock?.lighting_style || ''}
  Veo Style Tokens: 
    ${(bible.visual_style_lock?.veo_style_tokens || []).join(', ')}
  Forbidden Elements: 
    ${(bible.visual_style_lock?.forbidden_elements || []).join(', ')}
  Film Grain: ${bible.visual_style_lock?.film_grain ?? false}
 
  CHARACTER BLUEPRINTS (DNA):
  Ensure that when a character is active in the scene, their visual features are locked EXACTLY to their DNA attributes:
  ${JSON.stringify((bible.character_roster || []).map((c: any) => ({ id: c.id, name: c.name, dna: c.dna })), null, 2)}
  `;

  return `You are the Veo Prompt Generator. Your job is to compile a highly technical camera direction sheet and text-to-video generation prompt optimized for Google Veo 3.1.

${dynamicContext}

DURATION RULES:
Assign duration_seconds based on scene_type:
- rapid_cut: 5s — fast action, high-energy montage, quick reveal, jump scare equivalent
- short_punch: 6s — punchy statement scene, single-focus moment, visual emphasis beat
- slow_burn: 10s — building tension, emotional reveal, lingering character reaction
- standard: 8s — default narration-driven scene, but adjust freely based on pacing needs.
Choose the duration that serves the scene's emotional purpose. You may output any appropriate duration.

CINEMATIC INTENT — MANDATORY RULES:
1. SHOT TYPE SELECTION: Choose shot_type based on emotional purpose:
   - establishing/wide/aerial: spatial orientation, location reveals, scale moments
   - medium: dialogue energy, character action, default narrative shot
   - close_up/extreme_close_up: emotional peak moments, detail reveals, tension beats
   - pov: immersive moments, character perspective, reveal scenes
   - over_shoulder: confrontation, conversation, following action
   - insert: object significance, symbolic detail, clue reveals
2. EMOTIONAL ARC ALIGNMENT: Match your shot choices to the phase's emotional intensity:
   - Intensity 8–10 (climax): prioritize close_up, extreme_close_up, or handheld pov
   - Intensity 5–7 (escalation): mix medium and close_up with dynamic camera movement
   - Intensity 1–4 (setup/outro): wider shots, slower camera, more static or gentle movement
3. SHOT DIVERSITY (HARD RULE): You CANNOT use the same shot_type AND the same camera movement as any of the last 3 prompts. If a combination repeats, choose a different shot_type or different camera movement. This is non-negotiable.
4. CAMERA MOVEMENT VOCABULARY (use only these — one per prompt):
   ${cameraVocabulary}
5. RE-HOOK SCENES (phases 4, 6, 8 first scene): Use a contrasting shot type from the previous phase's last scene to signal tonal shift.

Design every field with this constraint in mind:

- Visual: Describe ONE continuous visual moment in a single paragraph favoring: Subject + Action + Scene/Context + Camera + Lens + Lighting + Mood + Audio. Enforce ONE dominant action in the clip (no compound or teleporting motion, no transitions within the Visual). Describe tight, physically continuous motion that fits the selected duration (no visual jumps).
  - BASE FOOTAGE ONLY: Describe ONLY the physical photorealistic scene or primary animated footage. NEVER instruct CGI overlays, infographics, HUDs, scale-comparison graphics (e.g., do NOT describe "CGI integration of multiple football fields" or "overlay showing data"), or screen overlays; those are added in post-production.
  - The output video must have a ${aspectRatio} aspect ratio.${aspectRatio === '9:16' ? ' For vertical 9:16 framing, ensure the subject is centered and action is vertically framed.' : ''} Length must be between 40 and 80 words.

- Shot: Detailed description of the framing (e.g. "tight frame on the protagonist's eyes, revealing doubt"). Do not repeat the category name itself in this field, describe the visual framing detail.

- shot_type: Must be exactly one of: establishing, wide, medium, close_up, extreme_close_up, aerial, pov, over_shoulder, insert.

- Camera: ONE precise camera movement only, matching the CAMERA MOVEMENT VOCABULARY above.

- Ambient Sound: Sustained background audio representing the continuous world soundscape. Choose wind, water, crowd, or ambient silence.

- SFX: 1-2 punctual foreground sounds directly matching the specific physical action happening in this exact Visual field. If the Visual shows fingers tracing papyrus, the SFX must be papyrus friction (not writing or a quill). If the Visual shows a stone bust, the SFX must be wind on stone (not jewelry).

- narration: This is the read-only post-production voiceover script fragment provided for the scene. You MUST return this string EXACTLY as provided in the user prompt input under "Narration". Do not edit, summarize, translate, or alter it in any way.

- Avoid: List of 6 to 10 specific exclusions.
  - Must always include verbatim: deformed hands, extra fingers, extra limbs, mutated anatomy, identity change, wardrobe change mid-shot, warped faces, text, watermark, logo, digital artifacts, smartphone screen, typography, written words, letters, brand names.
  - If the scene involves scale, UI, data, comparison graphics, or overlays, you must also append: infographics, UI elements, HUD, glowing lines, vector graphics, motion-graphics overlays.
  - Must include scene-specific exclusions relevant to the Visual (e.g. anachronisms, wrong-era props, wrong lighting conditions).
  - Never contradict the Visual field (do not forbid an element the Visual intentionally includes).

- Connection: One sentence describing the exact visual bridge to the next shot.

- Dialogue:
  - If the scene has NO dialogue (is_dialogue is false, or the scene input dialogue is empty or "None."), you must set this field to "None." and design the prompt for total silence: no characters speak, their mouths remain closed and neutral, with no lip movement.
  - If the scene HAS dialogue (is_dialogue is true), you must put the exact dialogue line spoken here. Design the Visual to show ONLY the speaking character's mouth moving to lip-sync the dialogue line, while all other characters remain silent with closed mouths.

DYNAMIC ADAPTATION RULES (NON-NEGOTIABLE):

VISUAL field:
- Always reflect the project topic and apply visual_style.
- All veo_style_tokens must appear naturally in the visual description.
- Numbers: write ALL numbers as words (e.g. "thirty-five" not "35").

LENS field:
- EXACTLY ONE consolidated lens/camera descriptor per prompt. Do not scatter conflicting lens or camera model information across the Visual, Lens, and Look fields. If the Lens field specifies a lens (e.g., "35mm prime lens"), make sure the Visual and Look fields do not specify different lenses or contradictory brands.
- If the project render_style is photorealistic live-action, you must specify a real physical lens focal length and an emotional effect (e.g. "85mm lens for intimate shallow depth of field", ${aspectRatio === '9:16' ? '"24mm spherical lens for dramatic portrait perspective distortion"' : '"18mm anamorphic lens for dramatic perspective distortion"'}). Derives from visual_style: cinematic/documentary uses 24mm-35mm primes; ASMR/intimate uses 85mm-100mm macro. ${aspectRatio === '9:16' ? 'CRITICAL: Since this project is vertical 9:16, do NOT use anamorphic or widescreen lens vocabulary; use spherical/standard prime lens vocabulary.' : ''}
- If the project render_style is animated, stylized, 2D, or 3D, you must use style-appropriate virtual camera and visual language (e.g., "virtual wide lens, soft depth-of-field styling", "clean flat projection, isometric perspective") instead of physical lenses or camera brands (no Arri/Cooke realism).

LIGHTING field:
- Must specify lighting source + direction + color temperature + shadow quality (e.g. "warm four-thousand Kelvin sunset light filtering from the left, casting deep, sharp shadows").
- Color temperature must be written as words (e.g. "five-thousand Kelvin" not "5000K").
- If film_grain from Production Bible is true, include "natural film grain" in the lighting field.

CAMERA VARIETY RULE:
- No camera movement may repeat in consecutive prompts.
- Across any 7-prompt sequence: minimum 4 distinct camera movements required.
- Banned combinations: slow dolly forward used more than twice in 7 prompts.

AUDIO CONSISTENCY RULE:
- Every single prompt MUST have Ambient Sound and SFX populated with scene-specific content.
- Ambient Sound: the continuous world audio.
- SFX: the sound of the specific physical action in this exact Visual.
- Never reuse the exact same Ambient Sound description across more than 2 consecutive prompts.

## OUTPUT FORMAT LOCK:
Your JSON output must contain these exact field keys and no others:
visual, lens, lighting, camera, ambient_sound, sfx, dialogue, avoid, connection, narration, shot, shot_type, duration_seconds, scene_type.

Do not output: veo_full_prompt, sound (as a nested object), timestamp, index, scene_number, or any field not listed above.

CRITICAL RULE: Every field value MUST end with a period (full stop). If the value already ends with a period, do not add a second one. If it ends with any other character, append a period.

Return ONLY a valid JSON object matching the requested schema. No prose.

REQUIRED JSON STRUCTURE (use exactly these field names without omission):
{
  "visual": "string",
  "shot": "string",
  "shot_type": "medium",
  "lens": "string detailing exactly one consolidated lens/camera descriptor, ensuring no contradictory lens info appears in the visual or look",
  "lighting": "string",
  "camera": "string",
  "ambient_sound": "string",
  "sfx": "string",
  "dialogue": "string",
  "avoid": "string",
  "connection": "string",
  "narration": "string (the exact voiceover line provided, returned without alteration)",
  "duration_seconds": 8,
  "scene_type": "standard"
}`;
};

export const getVeoUserPrompt = (
  scene: any,
  styleLock: VisualStyleLock,
  youtubeTranscript?: string | null,
  previousConnections?: string[],
  previousCameras?: string[],
  previousLightings?: string[],
  previousVisual?: string,
  emotionalArcContext?: string,
  shotDiversityConstraint?: string
): string => {
  let prompt = `Generate the Veo prompt configuration for the following scene. Note that all IDs have been fully resolved to their descriptions:

Scene Title: "${scene.title}"
Scene Number: ${scene.scene_number} (Phase ${scene.phase_number})
Narration: "${scene.narration_fragment}"
Emotional Beat: "${scene.emotional_beat}"
Visual Action Beat: "${scene.scene_description}"
Continuity constraints: "${scene.continuity_notes}"
Next scene transition: "${scene.transition_to_next}"

Resolved Setting / Environment:
"${scene.location_description}"

Resolved Characters in Frame:
${JSON.stringify(scene.characters_present, null, 2)}

Resolved Objects Featured:
${JSON.stringify(scene.objects_featured, null, 2)}

Style Lock Guidelines:
- Mood: "${styleLock.color_mood}"
- Lighting Style: "${styleLock.lighting_style}"
- Color Palette: "${styleLock.color_palette.join(', ')}"
- Camera movement style: "${styleLock.camera_movement_style}"
- Film Grain: ${styleLock.film_grain}
- Veo Style Tokens to inject: [${styleLock.veo_style_tokens.join(', ')}]
- Forbidden Elements to add to Avoid list: [${styleLock.forbidden_elements.join(', ')}]`;

  if (emotionalArcContext) {
    prompt += `\n\n## EMOTIONAL ARC & SCENE POSITION:\n${emotionalArcContext}`;
  }

  if (shotDiversityConstraint) {
    prompt += `\n\n## SHOT DIVERSITY CONSTRAINTS:\n${shotDiversityConstraint}`;
  }

  if (previousConnections && previousConnections.length > 0) {
    prompt += `\n\n## PREVIOUS_CONNECTIONS (do not repeat these):\n${previousConnections.map(c => `- ${c}`).join('\n')}`;
  }

  if (previousCameras && previousCameras.length > 0) {
    prompt += `\n\n## PREVIOUS_CAMERA_MOVEMENTS (vary from these):\n${previousCameras.map(c => `- ${c}`).join('\n')}`;
  }

  if (previousLightings && previousLightings.length > 0) {
    prompt += `\n\n## PREVIOUS_LIGHTING (vary from these):\n${previousLightings.map(l => `- ${l}`).join('\n')}`;
  }

  if (previousVisual) {
    prompt += `\n\n## PREVIOUS_SCENE_VISUAL:\n"${previousVisual}"`;
  }

  if (youtubeTranscript && youtubeTranscript.trim().length > 0) {
    prompt += `\n\nYouTube Transcript Reference:\n"${youtubeTranscript}"\n\nThe narration field should echo the natural cadence, pauses, and rhetorical style of the YouTube transcript provided.`;
  }

  return prompt;
};
