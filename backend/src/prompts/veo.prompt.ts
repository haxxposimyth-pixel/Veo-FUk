import { VisualStyleLock, SCENE_DURATION_SECONDS } from 'shared';
import type { ContentProfileConfig } from 'shared';

export const CAMERA_MOVE_TIERS = {
  calm: ['Static', 'Very slow push in', 'Very slow pull back', 'Locked-off pan'],
  standard: ['Static', 'Slow push in', 'Slow pull back', 'Pan left', 'Pan right', 'Tilt up', 'Tilt down', 'Tracking shot', 'Dolly in', 'Dolly out', 'Rack focus'],
  dynamic: ['Static', 'Slow push in', 'Slow pull back', 'Pan left', 'Pan right', 'Tilt up', 'Tilt down', 'Tracking shot', 'Handheld', 'Crane up', 'Crane down', 'Dolly in', 'Dolly out', 'Whip pan', 'Rack focus']
};

export const SHOT_SIZE_ROTATION = ["establishing", "wide", "medium", "close_up", "extreme_close_up"];

export function resolveEnergyTier(profile?: ContentProfileConfig): 'calm' | 'standard' | 'dynamic' {
  return (profile?.cameraEnergy || 'dynamic') as 'calm' | 'standard' | 'dynamic';
}

export function getAssignedShotGrammar(globalIndex: number, tier: "calm" | "standard" | "dynamic"): { cameraMove: string; shotSize: string } {
  const cameraMove = CAMERA_MOVE_TIERS[tier][globalIndex % CAMERA_MOVE_TIERS[tier].length];
  const shotSize   = SHOT_SIZE_ROTATION[globalIndex % SHOT_SIZE_ROTATION.length];
  return { cameraMove, shotSize };
}

export const getVeoSystemPrompt = (project: any, bible: any, profile?: ContentProfileConfig): string => {
  const cameraEnergy = resolveEnergyTier(profile);
  const cameraVocabulary = CAMERA_MOVE_TIERS[cameraEnergy].join(' | ');

  const adjectiveVarietyRule = profile?.id === 'documentary'
    ? `- STRICT OBSERVATIONAL REALISM (HARD RULE): Do NOT use any evaluative or filler adjectives that add no visible information (such as "beautiful", "stunning", "majestic", "breathtaking", "epic", "gorgeous", "mesmerizing", "captivating", "dramatic"). You must describe ONLY concrete, observable nouns, physical materials, and literal actions (e.g., "rust streaks down the riveted iron hull" instead of "a beautiful old ship"). Every word must describe a visible physical detail. Do NOT use lazy crutch adjectives (majestic, monumental, colossal, epic, immense, massive, clean, industrial, powerful, precise) — replace them with specific sensory descriptions. Vary the emotional and physical register across shots (huge vs tiny, fast vs slow, quiet vs explosive, human vs mechanical).`
    : profile?.id === 'cinematic_series'
      ? `- CINEMATIC FLOURISH & DRAMATIC STYLE: You are encouraged to use high-impact, evocative visual description. However, you must avoid lazy crutch adjectives (majestic, monumental, colossal, epic, immense, massive, clean, industrial, powerful, precise) and replace them with specific, sensory descriptions. Vary the emotional and physical register across shots (huge vs tiny, fast vs slow, quiet vs explosive, human vs mechanical) to ensure dynamic pacing.`
      : `- Prefer concrete, observable nouns, physical materials, and literal actions over subjective evaluative adjectives. Do NOT use lazy crutch adjectives (majestic, monumental, colossal, epic, immense, massive, clean, industrial, powerful, precise) — replace them with specific sensory descriptions. Vary the emotional and physical register across shots (huge vs tiny, fast vs slow, quiet vs explosive, human vs mechanical) to keep the visual sequence dynamic.`;

  const environmentalRealismRule = profile?.id === 'documentary'
    ? `- ENVIRONMENTAL REALISM & MICRO-PHYSICS (HARD RULE): Enrich the description with physically-grounded, observable detail appropriate to the materials and environment actually present in the scene. Incorporate per-subject micro-event textures chosen specifically for the subject in focus from this palette: sparks, pantograph arcing, heat shimmer, vibration/wobble, smoke/steam, surface condensation, paint flakes, rust flakes, cable sway, surface reflections/ripples, wind, birds, grime/wear. Do NOT reuse the same single dominant texture in consecutive shots, and do NOT default to dust/particulate; vary the lead micro-texture across shots, choosing whatever fits the specific scene. Use grounded, observational physical detail only (no stylization). Word-neutral: substitute generic descriptors with these concrete details, targeting 60 to 75 words without increasing overall length. Strictly avoid any meta-phrasing, rendering terminology, camera specifications, or aesthetic buzzwords (such as those listed under the ABSOLUTE WORD BAN).`
    : profile?.id === 'cinematic_series'
      ? `- CINEMATIC ENVIRONMENTAL & CONTINUITY BEATS: Enrich descriptions with atmospheric features and surface reflections to emphasize high-production scale. Incorporate per-subject micro-event textures chosen specifically for the subject in focus from this palette: sparks, pantograph arcing, heat shimmer, vibration/wobble, smoke/steam, surface condensation, paint flakes, rust flakes, cable sway, surface reflections/ripples, wind, birds, grime/wear. Do NOT reuse the same single dominant texture in consecutive shots, and do NOT default to dust/particulate; vary the lead micro-texture across shots, choosing whatever fits the specific scene. Do not increase overall word length, targeting 60 to 75 words. Strictly avoid any meta-phrasing, rendering terminology, camera specifications, or aesthetic buzzwords (such as those listed under the ABSOLUTE WORD BAN).`
      : `- ENVIRONMENTAL REALISM & MICRO-PHYSICS: Enrich the description with physically-grounded, observable detail appropriate to the materials and environment actually present in the scene. Incorporate per-subject micro-event textures chosen specifically for the subject in focus from this palette: sparks, pantograph arcing, heat shimmer, vibration/wobble, smoke/steam, surface condensation, paint flakes, rust flakes, cable sway, surface reflections/ripples, wind, birds, grime/wear. Do NOT reuse the same single dominant texture in consecutive shots, and do NOT default to dust/particulate; vary the lead micro-texture across shots, choosing whatever fits the specific scene. Word-neutral: substitute generic descriptors with these concrete details, targeting 60 to 75 words without increasing overall length. Strictly avoid any meta-phrasing, rendering terminology, camera specifications, or aesthetic buzzwords (such as those listed under the ABSOLUTE WORD BAN).`;

  const shotCompositionRule = profile?.id === 'documentary'
    ? `- Shot: A concise phrase or single sentence describing camera framing, angle, height, and spatial depth layering (e.g. "eye-level medium shot on the subject, centering them according to the rule of thirds, with foreground equipment softened and background walls blurred").
  - OBSERVATIONAL FRAMING & DEPTH LAYERING (HARD RULE): Describe spatial depth via layering (clear foreground, midground, and background elements, specifying which elements read sharp vs. softened/hazy). Express layering physically, NEVER use banned camera/rendering jargon ("depth of field", "bokeh", "lens flare", "focus", "focused", "unfocused", "out-of-focus"). Define subject placement (rule-of-thirds, eyelines, natural headroom) and camera perspective (stable, eye-level, naturalistic angles for observational honesty). Keep it to one concise phrase or sentence.
  - SEPARATION OF CONCERNS: The Shot field describes only the framing (angle, height, layering intent). The Visual field describes physical scene content and actions. Do not duplicate or contradict between them, and keep ONE coherent shot type.`
    : profile?.id === 'cinematic_series'
      ? `- Shot: A concise phrase or single sentence describing camera framing, angle, height, and spatial depth layering (e.g., "sweeping low-angle tracking shot centering the confrontation, with heat shimmer warping the far background and background debris blurred").
  - CINEMATIC COMPOSITION & DRAMATIC ANGLES: Describe dramatic, dynamic angles (low-angle, high-angle, Dutch tilts, whip pans, crane shots) to capture action and scale. Define spatial depth via clear foreground, midground, and background layering. Note: "depth of field", "bokeh", "lens flare", and "focus" are allowed for cinematic projects to specify technical camera details.
  - SEPARATION OF CONCERNS: The Shot field describes only the framing (angle, height, layering intent). The Visual field describes physical scene content and actions. Do not duplicate or contradict between them, and keep ONE coherent shot type.`
      : `- Shot: A concise phrase or single sentence describing camera framing, angle, height, and spatial depth layering (e.g. "low-angle medium shot on the subject, centering them according to the rule of thirds, with foreground equipment softened and background walls blurred").
  - DYNAMIC COMPOSITION & DEPTH LAYERING: Describe spatial depth via layering (clear foreground, midground, and background elements, specifying which elements read sharp vs. softened/hazy). Express layering physically, NEVER use banned camera/rendering jargon ("depth of field", "bokeh", "lens flare", "focus", "focused", "unfocused", "out-of-focus"). Define subject placement (rule-of-thirds, leading lines, dramatic headroom/eyelines) and camera perspective (dynamic heights, low-angle, or high-angle views allowed). Keep it to one concise phrase or sentence.
  - SEPARATION OF CONCERNS: The Shot field describes only the framing (angle, height, layering intent). The Visual field describes physical scene content and actions. Do not duplicate or contradict between them, and keep ONE coherent shot type.`;


  const aspectRatio = project?.aspect_ratio || '16:9';

  const absoluteWordBan = profile?.id === 'cinematic_series'
    ? `- ABSOLUTE WORD BAN: You must NEVER output any of these specific words or their variations/plurals in the visual description field: "textures", "texture", "naturalistic", "authentic", "aesthetic", "aesthetics", "shaders", "shader", "rendering", "render", "photorealistic", "realism", "realistic", "CGI integration", "CGI", "integration", "large-format sensor", "sensor", "film grain", "grain", "fidelity", "documentary", "focus". This includes composite phrases such as "industrial aesthetic", "documentary realism", "realistic textures", "large-format sensor", "photorealistic cgi", "focus". You must translate these concepts into raw visible things (e.g., write "weathered steel and peeling paint" instead of "industrial aesthetic" or "textures"). Note: "cinematic", "lens flare", "depth of field", and "bokeh" are allowed for cinematic projects.`
    : `- ABSOLUTE WORD BAN: You must NEVER output any of these specific words or their variations/plurals in the visual description field: "textures", "texture", "naturalistic", "authentic", "aesthetic", "aesthetics", "shaders", "shader", "rendering", "render", "photorealistic", "realism", "realistic", "CGI integration", "CGI", "integration", "depth of field", "bokeh", "large-format sensor", "sensor", "film grain", "grain", "lens flare", "lens flares", "fidelity", "cinematic", "documentary", "focus". This includes composite phrases such as "industrial aesthetic", "cinematic lighting", "documentary realism", "realistic textures", "depth of field", "large-format sensor", "photorealistic cgi", "focus". You must translate these concepts into raw visible things (e.g., write "weathered steel and peeling paint" instead of "industrial aesthetic" or "textures").`;

  const cinematicRulesBlock = profile?.id === 'cinematic_series'
    ? `## CINEMATIC SERIES PIPELINE RULES:
- DYNAMIC CAMERA ENERGY: Use high-energy, dramatic, and sweeping camera moves (e.g., dolly zooms, crane shots, handheld camera tracking, whip pans).
- DRAMATIC LIGHTING & OCCASIONAL LENS FLARES: Describe cinematic lighting (e.g., high-contrast chiaroscuro, colorful neon backlighting, rim lighting) to amplify drama and atmosphere. Use lens flares sparingly, ONLY when the scene is strongly backlit by direct sun or intense light sources; do not suggest lens flares as a default.
- CREATURE SCALE & COMBAT CHOREOGRAPHY: Explicitly detail creature/monster size, power activation, aggressive action, and combat beats with clear physical choreography.
- SNAPSHOT CONTINUITY CONSUMPTION: Pay close attention to the visual state snapshot fields:
  * character_damage: describe character injuries/wounds (e.g. "a bleeding slash wound on his left arm").
  * costume_armor_state: describe costume wear and tear (e.g. "his leather jacket is torn at the shoulder").
  * creature_states: describe creature status (unharmed, injured, defeated, dead) and whether powers are active.
  * environmental_destruction: describe broken environment details (e.g. "shattered neon glass and crumbling brick on the ground").
- COPYRIGHT-SAFE ORIGINALITY: Never describe copyrighted or franchise-owned characters, creatures, or designs (no Godzilla, Xenomorphs, Marvel/DC superheroes, etc.). Describe original visual designs instead.`
    : '';

  const compactLocations = (bible.location_roster || []).map((l: any) => ({
    name: l.name,
    type: l.type
  }));

  const compactObjects = (bible.object_registry || []).map((o: any) => ({
    name: o.name,
    category: o.category,
    is_hero_prop: o.is_hero_prop,
    is_branded_product: o.is_branded_product
  }));

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
 
  LOCATION ROSTER (COMPACT):
  ${JSON.stringify(compactLocations, null, 2)}

  OBJECT REGISTRY (COMPACT):
  ${JSON.stringify(compactObjects, null, 2)}

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

- Visual: Describe ONE continuous visual moment in a single paragraph favoring: Subject + Action + Scene/Context + Camera + Lens + Lighting + Mood + Audio.
  - SINGLE DOMINANT ACTION: Enforce exactly ONE dominant continuous action or moment in the clip (no compound or teleporting motion, and no listing of multiple simultaneous activities). You may use at most one optional WITHIN-TAKE transition (rack focus, whip pan, speed ramp, foreground occlusion/wipe by a passing object, lens-flare wipe, match-on-action). EXPLICITLY FORBID edit-layer cuts inside a single clip (such as hard cut, match cut between different scenes, dissolve, fade) — those are NOT in-clip transitions.
  - LENGTH: Target a length of 60 to 75 words (strictly between 40 and 80 words).
  - If you reference a color temperature anywhere in the Visual description, write it numerically with a K suffix (e.g. '5500K'), never spelled out in words and never translated.
  - METADATA EXCLUSION: Do NOT write any meta-phrasing, rendering terms, camera specifications, or aesthetic words in the visual description.
  ${absoluteWordBan}
  ${environmentalRealismRule}
  - CONTEXT OVERRIDE: If the PROJECT CONTEXT, Visual Style, or Style Lock Guidelines contain any of the banned terms listed in the ABSOLUTE WORD BAN, you MUST ignore those specific terms and translate them into concrete visible elements instead. Do not copy them, their synonyms, or related meta-jargon into the Visual field.
  - BASE FOOTAGE ONLY: Describe ONLY the physical photorealistic scene or primary animated footage. NEVER instruct CGI overlays, infographics, HUDs, scale-comparison graphics (e.g., do NOT describe "CGI integration of multiple football fields" or "overlay showing data"), or screen overlays; those are added in post-production.
  - The output video must have a ${aspectRatio} aspect ratio.${aspectRatio === '9:16' ? ' For vertical 9:16 framing, ensure the subject is centered and action is vertically framed.' : ''}
  - TERRAIN SIGNATURE RULE (MANDATORY): When the scene's setting is a named real-world location (e.g., Zoji La Pass, Kishtwar Road, or any specific mountain pass/dangerous road), the Visual description must depict that location's characteristic physical/geological terrain (such as muddy/slushy roads, loose grey shale, high snow embankments, sheer drop-offs, low hanging rocky cave ceilings) instead of a generic "narrow mountain road". Derive from the location's known real-world traits; if unknown, use specific, plausible terrain consistent with the region rather than generic filler.

  ${shotCompositionRule}
  ${cinematicRulesBlock ? '\n  ' + cinematicRulesBlock + '\n' : ''}

- shot_type: Must be exactly one of: establishing, wide, medium, close_up, extreme_close_up, aerial, pov, over_shoulder, insert.

- Camera: ONE precise camera movement only, matching the CAMERA MOVEMENT VOCABULARY above.

- action_arc: A Start->Motion->End arc for ONE continuous take (subject/camera state at start -> the single dominant motion -> end state). Describe a temporal sequence of one continuous ~8s action, e.g. "Locomotive enters frame from left, accelerates as dry leaves scatter in the draft, sunlight glints across the steel flank, settling as the rear power car clears the curve." It must stay ONE continuous shot (no scene cuts inside it).

- in_clip_transition: An optional single within-take/in-camera transition drawn from this vocabulary: rack focus, whip pan, speed ramp, foreground occlusion/wipe by a passing object, lens-flare wipe, match-on-action. If the shot is a plain continuous take, leave this as "none". EXPLICITLY FORBID edit-layer cuts inside a single clip (such as hard cut, match cut between different scenes, dissolve, fade) — those are NOT in-clip transitions.

- Ambient Sound: Sustained background audio representing the continuous world soundscape. Choose wind, water, crowd, or ambient silence.

- SFX: 1-2 punctual foreground sounds directly matching the specific physical action happening in this exact Visual field. If the Visual shows fingers tracing papyrus, the SFX must be papyrus friction (not writing or a quill). If the Visual shows a stone bust, the SFX must be wind on stone (not jewelry).

- narration: This is the read-only post-production voiceover script fragment provided for the scene. You MUST return this string EXACTLY as provided in the user prompt input under "Narration". Do not edit, summarize, translate, or alter it in any way.

- Avoid: List of 6 to 10 specific exclusions.
  - Must always include verbatim: deformed hands, extra fingers, extra limbs, mutated anatomy, identity change, wardrobe change mid-shot, warped faces, subtitles, burned-in captions, hardcoded on-screen text, lower-thirds, UI overlays, watermarks, editorial graphics, digital artifacts, smartphone screen. (Note: Do NOT blanket-ban in-world diegetic text, real-world signage, painted vehicle art/slogans, license plates, road and shop signs, or branding that naturally appears on real objects; those are explicitly allowed).
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
- All veo_style_tokens must appear naturally in the visual description, EXCEPT for any forbidden/rendering/aesthetic terms listed in the ABSOLUTE WORD BAN. You MUST ignore those specific style tokens and describe the raw visible scene instead.
- Numbers: write ALL numbers as words (e.g. "thirty-five" not "35"). For aircraft model designations (like the Boeing 7x7 family), write them in their canonical spoken grouped format (e.g. "seven eighty-seven", "seven forty-seven", "seven thirty-seven", etc.) instead of cardinal words or digits.
- Forbid vague/invisible descriptors: do NOT use "imperceptibly", "subtly", "seamless", "complex", "profound", or "dynamic data". You must describe concrete visible changes (e.g. "fuel surface visibly lowers", "waterline reveals a band of hull paint", "gauge needle vibrates", "blue bars rise/fall").
${adjectiveVarietyRule}
- Absolute Word Ban: Do NOT use any banned words or camera parameters in the visual description under any circumstances.
- For screens, consoles, and interfaces, ensure there is no text or numbers; use abstract/symbolic graphics only — no readable UI labels. Do not describe text as "blurred" or "unreadable" — specify that there is no text or numbers, only abstract shapes and symbols.

LENS field:
- EXACTLY ONE consolidated lens/camera descriptor per prompt. Do not scatter conflicting lens or camera model information across the Visual, Lens, and Look fields. If the Lens field specifies a lens (e.g., "35mm prime lens"), make sure the Visual and Look fields do not specify different lenses or contradictory brands.
- LENS/DEPTH-OF-FIELD COUPLING RULE (HARD RULE): The lens and depth of field choice must match the TARGET SHOT SIZE. Wide/establishing/aerial shots MUST use wide prime/spherical lenses (e.g. 18mm to 28mm) and deep focus (e.g., "twenty-four millimeter lens for deep focus, keeping the entire scene sharp and in-focus"). For these wide shots, you must NEVER describe "shallow depth of field", "bokeh", "blurred background", or "shallow focus" in either the Lens or Visual fields. Medium shots can use 35mm-50mm lenses. Close-up and extreme close-up shots are allowed to use narrow lenses (e.g. 85mm-100mm) and shallow depth of field with soft, blurred background bokeh.
- If the project render_style is photorealistic live-action, you must specify a real physical lens focal length and an emotional effect matching the target shot size (e.g. "85mm lens for intimate close-up with shallow depth of field", ${aspectRatio === '9:16' ? '"24mm spherical lens for dramatic wide-angle portrait perspective distortion"' : '"18mm anamorphic lens for dramatic wide-angle perspective distortion"'}). Derives from visual_style: cinematic/documentary uses 24mm-35mm primes; ASMR/intimate uses 85mm-100mm macro. ${aspectRatio === '9:16' ? 'CRITICAL: Since this project is vertical 9:16, do NOT use anamorphic or widescreen lens vocabulary; use spherical/standard prime lens vocabulary.' : ''}
- If the project render_style is animated, stylized, 2D, or 3D, you must use style-appropriate virtual camera and visual language matching the target shot size (e.g., "virtual wide lens, deep focus styling", "virtual telephoto lens, soft depth-of-field styling", "clean flat projection, isometric perspective") instead of physical lenses or camera brands (no Arri/Cooke realism).

LIGHTING field:
- Must specify lighting source + direction + color temperature + shadow quality (e.g. "warm four-thousand Kelvin sunset light filtering from the left, casting deep, sharp shadows").
- Color temperature must be written as words (e.g. "five-thousand Kelvin" not "5000K").
- If film_grain from Production Bible is true, include "natural film grain" in the lighting field.

CAMERA VARIETY RULE:
- CAMERA MOVEMENT SIMPLICITY RULE (HARD RULE): Describe ONLY the single assigned camera move in the Visual and Action Arc fields. Do NOT describe compound, stacked, or multiple camera movements (e.g., if the assigned move is 'Static', do not describe panning, tilting, orbiting, or handheld shake in the Visual or Action Arc; keep the camera movement simple and dedicated to that single action).
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
visual, action_arc, in_clip_transition, lens, lighting, camera, ambient_sound, sfx, dialogue, avoid, connection, narration, shot, shot_type, duration_seconds, scene_type, overlay_suggestions.

Do not output: veo_full_prompt, sound (as a nested object), timestamp, index, scene_number, or any field not listed above.

CRITICAL RULE: Every field value MUST end with a period (full stop). If the value already ends with a period, do not add a second one. If it ends with any other character, append a period.

Return ONLY a valid JSON object matching the requested schema. No prose.

REQUIRED JSON STRUCTURE (use exactly these field names without omission):
{
  "visual": "string",
  "action_arc": "Start->Motion->End temporal action arc for one continuous take.",
  "in_clip_transition": "none | in-clip transition type from allowed vocabulary.",
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
  "scene_type": "standard",
  "overlay_suggestions": [
    {
      "text": "string (on-screen label, callout, chapter title, or diagram annotation derived from narration and scene context, like component names, key terms, or numbers like '70–80°C'. Labels MUST always be in ENGLISH even if the narration is in Hindi)",
      "type": "label | callout | title | annotation",
      "target": "string (visual element this anchors to, e.g. 'Compress inlet' or 'willis carrier portrait')",
      "timing": "string (optional timing annotation)"
    }
  ]
}

OVERLAY GROUNDING RULES:
1. Every overlay_suggestions text/target MUST anchor to an entity present in object_registry/location_roster, OR an explicit fact from the scene's narration/script (e.g. a temperature, year, spec).
2. NEVER invent a name, place, or spec not present in those sources.
3. These are post-production editor notes that must NOT describe anything rendered in the footage itself. They are separate editorial metadata and must never be injected into the Veo visual prompt.
`;
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
  shotDiversityConstraint?: string,
  profile?: ContentProfileConfig,
  assignedConstraints?: { cameraMove: string; shotSize: string },
  sceneTimeOfDay?: string
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

  if (profile?.id === 'cinematic_series') {
    let snapshot: any = null;
    try {
      snapshot = scene.visual_state_snapshot
        ? (typeof scene.visual_state_snapshot === 'string' ? JSON.parse(scene.visual_state_snapshot) : scene.visual_state_snapshot)
        : (scene.raw_json ? (typeof scene.raw_json === 'string' ? JSON.parse(scene.raw_json).visual_state_snapshot : scene.raw_json.visual_state_snapshot) : null);
    } catch (e) {}

    if (snapshot) {
      const damageList = snapshot.character_damage ? Object.entries(snapshot.character_damage).map(([id, desc]) => `- Character ${id}: ${desc}`).join('\n') : '';
      const costumeList = snapshot.costume_armor_state ? Object.entries(snapshot.costume_armor_state).map(([id, desc]) => `- Character ${id}: ${desc}`).join('\n') : '';
      const creatureList = snapshot.creature_states ? snapshot.creature_states.map((c: any) => `- ${c.name}: status=${c.status}, powers_active=${c.powers_active ?? 'N/A'}`).join('\n') : '';
      const envDestruction = snapshot.environmental_destruction || '';

      prompt += `

## CURRENT SCENE VISUAL CONTINUITY STATE (MUST BE DEPICTED IN THE VISUAL PROMPT):
- Character Damage/Injuries:
${damageList || '  None'}
- Costume/Armor State:
${costumeList || '  None'}
- Creature/Monster States:
${creatureList || '  None'}
- Environmental Destruction:
  ${envDestruction || 'None'}`;
    }
  }

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

  if (assignedConstraints) {
    prompt += `\n\n## ASSIGNED SHOT CONSTRAINTS (MANDATORY):
- ASSIGNED CAMERA MOVE (MANDATORY): ${assignedConstraints.cameraMove}. The \`camera\` field MUST be this move, and the visual + action_arc MUST be written around executing this exact move. Do not substitute a different move.
- TARGET SHOT SIZE: ${assignedConstraints.shotSize}. Use this size unless the scene context makes it physically impossible; if you must deviate, pick a size DIFFERENT from a plain wide — never collapse to wide/wide/wide.`;
  }

  if (sceneTimeOfDay) {
    prompt += `\n\n## TIME-OF-DAY LOCK:
This scene occurs during the ${sceneTimeOfDay}. The Visual's sun position, light quality, and any time references MUST be consistent with ${sceneTimeOfDay}. Do NOT describe a different time of day (e.g. no 'midday'/'noon'/'sunset'/'night' when the period is morning).`;
  }

  return prompt;
};
