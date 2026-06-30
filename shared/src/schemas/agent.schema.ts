import { z } from 'zod';
import { SCENE_DURATION_SECONDS, MAX_PHASE_COUNT } from '../constants';
import { RenderFamilies } from '../constants/render-families';
import { getWordCount } from '../utils/narration-fit';

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 1 — Production Bible
//
// Schemas are intentionally permissive (.passthrough + .optional fallbacks)
// so they survive minor field variations across Gemini model versions.
// ─────────────────────────────────────────────────────────────────────────────

export function getDefaultDnaForType(type: string, physicalDescription?: string, costumeDescription?: string) {
  const baseDesc = physicalDescription ?? '';
  const baseCostume = costumeDescription ?? '';
  
  switch (type) {
    case 'human':
      return {
        facial_features: baseDesc || 'Standard facial features.',
        clothing: baseCostume || 'Casual clothing.',
        age: 'Adult.',
        hairstyle: 'Standard hairstyle.',
        body_type: 'Average height and build.',
        consistency_notes: 'Maintain facial structure and clothing consistency.',
      };
    case 'robot':
      return {
        facial_features: baseDesc || 'Mechanical faceplate/sensors.',
        clothing: baseCostume || 'Metallic chassis, visible wiring or armor panels.',
        age: 'N/A',
        hairstyle: 'N/A',
        body_type: 'Metallic or synthetic robotic frame.',
        consistency_notes: 'Maintain metallic textures, joints, and light emission points.',
      };
    case 'animal':
      return {
        facial_features: baseDesc || 'Animal muzzle and facial features.',
        clothing: baseCostume || 'Natural fur/skin/feathers, no clothing.',
        age: 'Adult animal.',
        hairstyle: 'Natural fur/feather pattern.',
        body_type: 'Standard quadruped or biped animal build.',
        consistency_notes: 'Maintain fur pattern, snout shape, and scale.',
      };
    case 'creature':
      return {
        facial_features: baseDesc || 'Distinctive creature/monster features.',
        clothing: baseCostume || 'Exotic texture or minimal coverings.',
        age: 'N/A',
        hairstyle: 'N/A or exotic texture.',
        body_type: 'Non-humanoid or mutated silhouette.',
        consistency_notes: 'Maintain unique anatomical structure and skin texture.',
      };
    case 'object':
    case 'abstract':
    default:
      return {
        facial_features: baseDesc || 'No facial features, inanimate structure.',
        clothing: baseCostume || 'Surface textures and materials.',
        age: 'N/A',
        hairstyle: 'N/A',
        body_type: 'Inanimate shape or abstract geometry.',
        consistency_notes: 'Maintain consistent geometry, materials, and textures.',
      };
  }
}

export const characterDnaSchema = z
  .object({
    facial_features:    z.string().optional().default(''),
    clothing:           z.string().optional().default(''),
    age:                z.string().optional().default(''),
    hairstyle:          z.string().optional().default(''),
    body_type:          z.string().optional().default(''),
    consistency_notes: z.string().optional().default(''),
  })
  .passthrough();

export const appearanceLockSchema = z.object({
  character_type: z.enum(['human', 'creature', 'animal', 'robot', 'object', 'abstract']).default('human'),
  physical_description: z.string(),
  style_notes: z.string().optional(),
  ethnicity: z.string().optional(),
  approximate_age: z.string().optional(),
  gender: z.string().optional(),
  skin_tone: z.string().optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  face_structure: z.string().optional(),
  distinguishing_features: z.string().optional(),
  primary_clothing: z.string().optional(),
  clothing_colors: z.array(z.string()).optional().default([]),
  clothing_era: z.string().optional(),
  accessories: z.string().optional(),
  forbidden_appearance_changes: z.array(z.string()).optional().default([])
});

export const characterRosterItemSchema = z
  .object({
    id:                   z.string().regex(/^CHAR_\d{3}$/).or(z.string().min(1)),
    name:                 z.string().min(1),
    role:                 z.string().min(1),
    // model sometimes uses "description" instead of "physical_description"
    physical_description: z.string().min(1).optional(),
    description:          z.string().min(1).optional(),
    costume_description:  z.string().min(1).optional(),
    voice_tone:           z.string().min(1).optional().default('neutral'),
    significance:         z.string().min(1).optional().default('supporting'),
    is_narrator:          z.boolean().optional().default(false),
    dna:                  characterDnaSchema.optional(),
    appearance_lock:      appearanceLockSchema,
  })
  .passthrough()
  .transform((v) => ({
    ...v,
    physical_description: v.physical_description ?? v.description ?? '',
    costume_description:  v.costume_description  ?? '',
    voice_tone:           v.voice_tone            ?? 'neutral',
    significance:         v.significance          ?? 'supporting',
    is_narrator:          v.is_narrator           ?? false,
    dna: (() => {
      const charType = v.appearance_lock?.character_type ?? 'human';
      const defaults = getDefaultDnaForType(charType, v.physical_description ?? v.description, v.costume_description);
      const input = (v.dna ?? {}) as any;
      return {
        facial_features:    input.facial_features || defaults.facial_features,
        clothing:           input.clothing || defaults.clothing,
        age:                input.age || defaults.age,
        hairstyle:          input.hairstyle || defaults.hairstyle,
        body_type:          input.body_type || defaults.body_type,
        consistency_notes:  input.consistency_notes || defaults.consistency_notes,
      };
    })(),
    appearance_lock:      v.appearance_lock,
  }));

export const locationRosterItemSchema = z
  .object({
    id:                  z.string().regex(/^LOC_\d{3}$/).or(z.string().min(1)),
    name:                z.string().min(1),
    type:                z.string().min(1).optional().default('exterior'),
    atmosphere:          z.string().min(1).optional().default(''),
    lighting_notes:      z.string().min(1).optional().default(''),
    time_of_day_default: z.string().min(1).optional().default('day'),
    visual_signature:    z.string().min(1).optional().default(''),
    setting:             z.enum(['interior', 'exterior', 'mixed']).optional(),
  })
  .passthrough()
  .transform((v) => ({
    ...v,
    type:                v.type                ?? 'exterior',
    atmosphere:          v.atmosphere          ?? '',
    lighting_notes:      v.lighting_notes      ?? '',
    time_of_day_default: v.time_of_day_default ?? 'day',
    visual_signature:    v.visual_signature    ?? '',
    setting:             v.setting,
  }));

export const objectRegistryItemSchema = z
  .object({
    id:              z.string().regex(/^OBJ_\d{3}$/).or(z.string().min(1)).optional(),
    object_id:       z.string().regex(/^OBJ_\d{3}$/).or(z.string().min(1)).optional(),
    name:            z.string().min(1),
    category:        z.string().min(1).optional(),
    owner_or_location: z.string().min(1).optional(),
    visual_description: z.string().min(1).optional(),
    default_state:   z.string().min(1).optional(),
    active_state:    z.string().min(1).optional(),
    forbidden_variations: z.array(z.string()).optional(),
    description:     z.string().optional().default(''),
    symbolic_meaning: z.string().optional().default(''),
    screen_time:     z.string().optional().default('brief'),
    is_hero_prop:    z.boolean().optional().default(false),
    visual_lock:     z.string().optional().default(''),
    is_branded_product: z.boolean().optional().default(false),
  })
  .passthrough()
  .transform((v) => {
    const finalId = v.id ?? v.object_id ?? '';
    return {
      ...v,
      id: finalId,
      object_id: finalId,
      description:      v.description      ?? v.visual_description ?? '',
      symbolic_meaning: v.symbolic_meaning ?? '',
      screen_time:      v.screen_time      ?? 'brief',
      is_hero_prop:     v.is_hero_prop     ?? false,
      visual_lock:      v.visual_lock      ?? '',
      is_branded_product: v.is_branded_product ?? false,
    };
  });

export const timeOfDayLightingItemSchema = z.object({
  color_temperature_kelvin: z.string().optional().default(''),
  sun_position: z.string().optional().default(''),
  shadow_quality: z.string().optional().default(''),
  ambient_palette: z.array(z.string()).optional().default([]),
  mood: z.string().optional().default('')
}).passthrough();

export const timeOfDayLightingSchema = z.object({
  morning: timeOfDayLightingItemSchema.optional(),
  afternoon: timeOfDayLightingItemSchema.optional(),
  evening: timeOfDayLightingItemSchema.optional(),
  night: timeOfDayLightingItemSchema.optional()
}).passthrough();

export const visualStyleLockSchema = z
  .object({
    color_palette:          z.array(z.string()).min(1).optional().default(['#1a1a2e', '#16213e', '#e94560']),
    color_mood:             z.string().min(1).optional().default('cinematic'),
    film_grain:             z.boolean().optional().default(false),
    // aspect_ratio sometimes omitted by flash-lite — default to project value
    aspect_ratio:           z.string().optional().default('16:9'),
    camera_movement_style:  z.string().min(1).optional().default('dynamic'),
    lighting_style:         z.string().min(1).optional().default('cinematic'),
    forbidden_elements:     z.array(z.string()).optional().default([]),
    veo_style_tokens:       z.array(z.string()).min(1).optional().default(['cinematic lighting']),
    style_name:             z.string().optional(),
    film_stock_grade:       z.string().optional().default(''),
    lens_family:            z.string().optional().default(''),
    render_family:          z.enum(RenderFamilies as any).optional(),
    render_style:           z.string().optional(),
    time_of_day_lighting:   timeOfDayLightingSchema.optional(),
  })
  .passthrough()
  .transform((v) => {
    const familyMap: Record<string, string> = {
      photoreal_cinematic: 'photorealistic live-action cinematic',
      documentary_realism: 'documentary realism style',
      stylized_3d: 'stylized 3D graphics',
      pixar_3d: 'Pixar-style 3D animation',
      claymation_stopmotion: 'claymation stop-motion',
      anime_2d: '2D cel-shaded anime',
      painterly_watercolor: 'watercolor painting style',
      comic_graphic_novel: 'comic graphic novel style',
      flat_2d_vector: 'flat 2D vector',
      motion_graphics: 'motion graphics',
      pixel_art: 'pixel art',
    };
    const resolvedRenderStyle = v.render_style || (v.render_family && familyMap[v.render_family]) || 'cinematic';
    return {
      ...v,
      color_palette:         v.color_palette         ?? ['#1a1a2e', '#16213e'],
      color_mood:            v.color_mood            ?? 'cinematic',
      film_grain:            v.film_grain            ?? false,
      aspect_ratio:          v.aspect_ratio          ?? '16:9',
      camera_movement_style: v.camera_movement_style ?? 'dynamic',
      lighting_style:        v.lighting_style        ?? 'cinematic',
      forbidden_elements:    v.forbidden_elements    ?? [],
      veo_style_tokens:      v.veo_style_tokens      ?? ['cinematic lighting'],
      style_name:            v.style_name,
      film_stock_grade:      v.film_stock_grade      ?? '',
      lens_family:           v.lens_family           ?? '',
      render_style:          resolvedRenderStyle,
      time_of_day_lighting:  v.time_of_day_lighting  ?? {
        morning: {
          color_temperature_kelvin: 'four-thousand-five-hundred Kelvin',
          sun_position: 'low angle, east',
          shadow_quality: 'long, soft shadows',
          ambient_palette: ['#ffb7b2', '#ffdac1'],
          mood: 'warm, fresh'
        },
        afternoon: {
          color_temperature_kelvin: 'five-thousand-five-hundred Kelvin',
          sun_position: 'overhead, high angle',
          shadow_quality: 'short, sharp shadows',
          ambient_palette: ['#ffffff', '#e2f0cb'],
          mood: 'bright, neutral'
        },
        evening: {
          color_temperature_kelvin: 'three-thousand Kelvin',
          sun_position: 'very low angle, west',
          shadow_quality: 'extremely long, warm shadows',
          ambient_palette: ['#ff9aa2', '#b5ead7'],
          mood: 'golden hour, nostalgic'
        },
        night: {
          color_temperature_kelvin: 'six-thousand-five-hundred Kelvin',
          sun_position: 'moonlight, overhead',
          shadow_quality: 'diffuse, deep shadows',
          ambient_palette: ['#c7ceea', '#e2f0cb'],
          mood: 'cool, mysterious'
        }
      }
    };
  });

export const productionBibleMetaSchema = z
  .object({
    topic:                    z.string().min(1),
    genre:                    z.string().min(1).optional().default('documentary'),
    tone:                     z.string().min(1).optional().default('dramatic'),
    target_duration_minutes:  z.number().min(0.5).optional().default(5),
    language:                 z.string().min(1).optional().default('English'),
    aspect_ratio:             z.string().optional().default('16:9'),
  })
  .passthrough()
  .transform((v) => ({
    ...v,
    genre:                   v.genre                   ?? 'documentary',
    tone:                    v.tone                    ?? 'dramatic',
    target_duration_minutes: v.target_duration_minutes ?? 5,
    language:                v.language                ?? 'English',
    aspect_ratio:            v.aspect_ratio            ?? '16:9',
  }));

export const productionBibleAgentOutputSchema: z.ZodType<any, any, any> = z
  .object({
    // Accept all naming variants flash-lite might use
    character_roster:  z.array(characterRosterItemSchema).optional(),
    characters:        z.array(characterRosterItemSchema).optional(),
    character_list:    z.array(characterRosterItemSchema).optional(),

    location_roster:   z.array(locationRosterItemSchema).min(1).optional(),
    locations:         z.array(locationRosterItemSchema).min(1).optional(),
    location_list:     z.array(locationRosterItemSchema).min(1).optional(),

    object_registry:   z.array(objectRegistryItemSchema).min(1).optional(),
    objects:           z.array(objectRegistryItemSchema).min(1).optional(),
    object_list:       z.array(objectRegistryItemSchema).min(1).optional(),
    props:             z.array(objectRegistryItemSchema).min(1).optional(),

    visual_style_lock: visualStyleLockSchema.optional(),
    visual_style:      visualStyleLockSchema.optional(),
    style:             visualStyleLockSchema.optional(),

    meta:              productionBibleMetaSchema.optional(),
    metadata:          productionBibleMetaSchema.optional(),
    production_meta:   productionBibleMetaSchema.optional(),
    version:           z.number().optional(),
  })
  .passthrough()
  .transform((v) => {
    const characters   = v.character_roster ?? v.characters ?? v.character_list ?? [];
    const locations    = v.location_roster  ?? v.locations  ?? v.location_list  ?? [];
    const objects      = v.object_registry  ?? v.objects    ?? v.object_list    ?? v.props ?? [];
    const styleRaw     = v.visual_style_lock ?? v.visual_style ?? v.style;
    const metaRaw      = v.meta ?? v.metadata ?? v.production_meta;

    // Provide sensible defaults if style/meta are completely missing
    const style = styleRaw ?? {
      color_palette: ['#1a1a2e', '#16213e'],
      color_mood: 'cinematic',
      film_grain: false,
      aspect_ratio: '16:9',
      camera_movement_style: 'dynamic',
      lighting_style: 'cinematic',
      forbidden_elements: [],
      veo_style_tokens: ['cinematic lighting'],
    };
    const meta = metaRaw ?? {
      topic: 'Unknown',
      genre: 'documentary',
      tone: 'dramatic',
      target_duration_minutes: 5,
      language: 'English',
      aspect_ratio: '16:9',
    };

    return {
      character_roster:  characters,
      location_roster:   locations,
      object_registry:   objects,
      visual_style_lock: style,
      meta,
      version: v.version,
    };
  });

// ─── Script Word Count Target ──────────────────────────────────────────────────
export const SOFT_MIN_NARRATION_WORDS = 100;

export const scriptPhaseItemSchema = z
  .object({
    phase_number:               z.number().int().min(1).max(60),
    phase_type:                 z.enum(['hook', 'build_up', 'escalation', 'climax', 'outro']),
    phase_title:                z.string().min(1),
    phase_content:              z.string().min(10),
    narration_text:             z.string().min(1),
    narration_word_count:       z.number().int().min(60),
    key_events:                 z.array(z.string()).optional().default([]),
    character_ids_active:       z.array(z.string()).optional().default([]),
    location_id_primary:        z.string().optional().default('LOC_001'),
    estimated_duration_seconds: z.number().min(1).optional().default(30),
    viral_hook_rating:          z.number().min(1).max(10).optional().default(7),
    rehook_type:                z.enum(['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt', 'pre_climax_spike']).nullable().optional(),
    open_loop_role:             z.enum(['plant', 'payoff', 'none']).optional().default('none'),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (val.phase_number !== 1 && val.narration_word_count < SOFT_MIN_NARRATION_WORDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `narration_word_count must be at least ${SOFT_MIN_NARRATION_WORDS} for phases 2-10`,
        path: ["narration_word_count"],
      });
    }
  })
  .transform((v) => ({
    ...v,
    key_events:                 v.key_events                 ?? [],
    character_ids_active:       v.character_ids_active       ?? [],
    location_id_primary:        v.location_id_primary        ?? 'LOC_001',
    estimated_duration_seconds: v.estimated_duration_seconds ?? 30,
    viral_hook_rating:          v.viral_hook_rating          ?? 7,
    rehook_type:                v.rehook_type                ?? null,
    open_loop_role:             v.open_loop_role             ?? 'none',
  }));

export const scriptAgentOutputSchema = z
  .object({
    // Accept multiple field name variants flash-lite might use
    title:                            z.string().min(1).optional(),
    script_title:                     z.string().min(1).optional(),
    name:                             z.string().min(1).optional(),
    total_estimated_duration_minutes: z.number().min(0.1).optional().default(5),
    total_duration_minutes:           z.number().min(0.1).optional(),
    duration_minutes:                 z.number().min(0.1).optional(),
    phases:                           z.array(scriptPhaseItemSchema).min(1).max(15).optional(),
    script_phases:                    z.array(scriptPhaseItemSchema).min(1).max(15).optional(),
    sections:                         z.array(scriptPhaseItemSchema).min(1).max(15).optional(),
    segments:                         z.array(scriptPhaseItemSchema).min(1).max(15).optional(),
  })
  .passthrough()
  .transform((v) => {
    const resolvedTitle   = v.title ?? v.script_title ?? v.name ?? 'Untitled Script';
    const resolvedPhases  = v.phases ?? v.script_phases ?? v.sections ?? v.segments ?? [];
    const resolvedDuration = v.total_estimated_duration_minutes
      ?? v.total_duration_minutes ?? v.duration_minutes ?? 5;
    return {
      title:                            resolvedTitle,
      phases:                           resolvedPhases.slice(0, 60),
      total_estimated_duration_minutes: resolvedDuration,
    };
  });

export const scriptOutlineItemSchema = z
  .object({
    phase_number:               z.number().int().min(1).max(60),
    phase_type:                 z.enum(['hook', 'build_up', 'escalation', 'climax', 'outro']),
    phase_title:                z.string().min(1),
    beat_intent:                z.string().min(1),
    viral_hook_rating:          z.number().min(1).max(10).optional().default(7),
    rehook_type:                z.enum(['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt', 'pre_climax_spike']).nullable().optional(),
    open_loop_role:             z.enum(['plant', 'payoff', 'none']).optional().default('none'),
  })
  .passthrough();

export const scriptOutlineOutputSchema = z
  .object({
    title:                            z.string().min(1).optional(),
    script_title:                     z.string().min(1).optional(),
    name:                             z.string().min(1).optional(),
    phases:                           z.array(scriptOutlineItemSchema).min(1).optional(),
    script_phases:                    z.array(scriptOutlineItemSchema).min(1).optional(),
    sections:                         z.array(scriptOutlineItemSchema).min(1).optional(),
    segments:                         z.array(scriptOutlineItemSchema).min(1).optional(),
  })
  .passthrough()
  .transform((v) => {
    const resolvedTitle   = v.title ?? v.script_title ?? v.name ?? 'Untitled Script';
    const resolvedPhases  = v.phases ?? v.script_phases ?? v.sections ?? v.segments ?? [];
    return {
      title:                            resolvedTitle,
      phases:                           resolvedPhases.slice(0, 60),
    };
  });

export const scriptSpineItemSchema = z
  .object({
    phase_number:               z.number().int().min(1).max(60),
    phase_type:                 z.enum(['hook', 'build_up', 'escalation', 'climax', 'outro']),
    phase_title:                z.string().min(1),
    narration_text:             z.string().min(1),
    viral_hook_rating:          z.number().min(1).max(10).optional().default(7),
    rehook_type:                z.enum(['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt', 'pre_climax_spike']).nullable().optional(),
    open_loop_role:             z.enum(['plant', 'payoff', 'none']).optional().default('none'),
  })
  .passthrough();

export const scriptSpineOutputSchema = z
  .object({
    title:                            z.string().min(1).optional(),
    script_title:                     z.string().min(1).optional(),
    name:                             z.string().min(1).optional(),
    phases:                           z.array(scriptSpineItemSchema).min(1).max(15).optional(),
    script_phases:                    z.array(scriptSpineItemSchema).min(1).max(15).optional(),
    sections:                         z.array(scriptSpineItemSchema).min(1).max(15).optional(),
    segments:                         z.array(scriptSpineItemSchema).min(1).max(15).optional(),
  })
  .passthrough()
  .transform((v) => {
    const resolvedTitle   = v.title ?? v.script_title ?? v.name ?? 'Untitled Script';
    const resolvedPhases  = v.phases ?? v.script_phases ?? v.sections ?? v.segments ?? [];
    return {
      title:                            resolvedTitle,
      phases:                           resolvedPhases.slice(0, 60),
    };
  });

export const scriptPhaseExpansionSchema = z
  .object({
    phase_content:              z.string().min(10),
    key_events:                 z.array(z.string()).optional().default([]),
    key_facts:                  z.array(z.string()).optional().default([]),
    key_images:                 z.array(z.string()).optional().default([]),
    character_ids_active:       z.array(z.string()).optional().default([]),
    characters_mentioned:       z.array(z.string()).optional().default([]),
    location_id_primary:        z.string().optional().default('LOC_001'),
  })
  .passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 3 — Scene Breakdown
// ─────────────────────────────────────────────────────────────────────────────

export const sceneItemSchema = z
  .object({
    scene_number:               z.number().int().min(1),
    title:                      z.string().min(1),
    scene_description:          z.string().min(1),
    continuity_notes:           z.string().optional().default(''),
    narration_fragment:         z.string().min(0),
    character_ids_present:      z.array(z.string()).optional().default([]),
    location_id:                z.string().optional().default('LOC_001'),
    object_ids_featured:        z.array(z.string()).optional().default([]),
    emotional_beat:             z.string().min(1).optional().default('neutral'),
    transition_to_next:         z.string().optional().default('cut'),
    estimated_duration_seconds: z.number().min(1).optional().default(SCENE_DURATION_SECONDS),
    is_dialogue:                z.boolean().optional().default(false),
    is_action:                  z.boolean().optional().default(false),
    narration_word_count:       z.number().int().min(0).optional(),
  })
  .passthrough()
  .transform((v) => {
    const narration = v.narration_fragment ?? '';
    // TODO: Thread language parameter properly. Fallback to English.
    const language = (v as any).language ?? (v as any).narration_language ?? 'English';
    const count = getWordCount(narration, language);
    return {
      ...v,
      continuity_notes:           v.continuity_notes           ?? '',
      character_ids_present:      v.character_ids_present      ?? [],
      location_id:                v.location_id                ?? 'LOC_001',
      object_ids_featured:        v.object_ids_featured        ?? [],
      emotional_beat:             v.emotional_beat             ?? 'neutral',
      transition_to_next:         v.transition_to_next         ?? 'cut',
      estimated_duration_seconds: v.estimated_duration_seconds ?? SCENE_DURATION_SECONDS,
      is_dialogue:                v.is_dialogue                ?? false,
      is_action:                  v.is_action                  ?? false,
      narration_word_count:       count,
    };
  });

export const sceneAgentOutputSchema = z
  .object({
    phase_number:    z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
    phaseNumber:     z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
    phase_title:     z.string().min(1).optional(),
    phaseTitle:      z.string().min(1).optional(),
    total_scenes:    z.number().int().min(1).optional(),
    totalScenes:     z.number().int().min(1).optional(),
    scenes:          z.array(sceneItemSchema).min(1).optional(),
    scene_list:      z.array(sceneItemSchema).min(1).optional(),
    scene_breakdown: z.array(sceneItemSchema).min(1).optional(),
  })
  .passthrough()
  .transform((v) => {
    const phaseNum = v.phase_number ?? v.phaseNumber ?? 1;
    const title    = v.phase_title ?? v.phaseTitle ?? 'Untitled Phase';
    const scenes   = v.scenes ?? v.scene_list ?? v.scene_breakdown ?? [];
    const total    = v.total_scenes ?? v.totalScenes ?? scenes.length;
    return {
      phase_number: phaseNum,
      phase_title:  title,
      total_scenes: total,
      scenes:       scenes,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 4 — Veo Prompt
// ─────────────────────────────────────────────────────────────────────────────

export const veoPromptAgentOutputSchema = z
  .object({
    prompt_number:    z.union([z.string(), z.number()]).optional(),
    visual:           z.string().min(1),
    shot:             z.string().optional(),
    shot_type:        z.enum(['establishing','wide','medium','close_up','extreme_close_up','aerial','pov','over_shoulder','insert']).optional(),
    lens:             z.string().min(1),
    lighting:         z.string().min(1),
    camera:           z.string().min(1),
    ambient_sound:    z.string().optional(),
    sfx:              z.string().optional(),
    dialogue:         z.string().optional(),
    avoid:            z.string(),
    connection:       z.string(),
    narration:        z.string().min(0),
    duration_seconds: z.coerce.number().int().optional(),
    action_arc:       z.string().describe('A temporal Start->Motion->End description of one continuous ~8s action (e.g. locomotive enters frame from left, accelerates as dry leaves scatter in the draft, sunlight glints across the steel flank, settling as the rear power car clears the curve). Must stay one continuous shot with no scene cuts inside.'),
    in_clip_transition: z.string().optional(),
    scene_type:       z.enum(['rapid_cut', 'standard', 'short_punch', 'slow_burn']).optional().default('standard'),
    veo_full_prompt:  z.string().optional(),
    avoid_contradiction: z.number().optional(),
    spoken_on_camera: z.boolean().optional().default(false),
    narration_audio_source: z.enum(['veo_on_camera', 'elevenlabs_vo']).optional().default('elevenlabs_vo'),
    overlay_suggestions: z.array(z.object({
      text: z.string(),
      type: z.enum(['label', 'callout', 'title', 'annotation']),
      target: z.string(),
      timing: z.string().optional()
    })).optional().default([]),
  })
  .passthrough()
  .transform((v) => ({
    ...v,
    prompt_number: v.prompt_number ?? '',
    shot: v.shot ?? 'MS',
    shot_type: v.shot_type ?? 'medium',
    ambient_sound: v.ambient_sound ?? 'ambient silence',
    sfx: v.sfx ?? 'None',
    dialogue: v.dialogue ?? '',
    duration_seconds: v.duration_seconds ?? 8,
    action_arc: v.action_arc,
    in_clip_transition: v.in_clip_transition ?? '',
    scene_type: v.scene_type ?? 'standard',
    veo_full_prompt: v.veo_full_prompt ?? '',
    spoken_on_camera: v.spoken_on_camera ?? false,
    narration_audio_source: v.narration_audio_source ?? 'elevenlabs_vo',
    overlay_suggestions: v.overlay_suggestions ?? [],
  }));

export const veoPromptCompleteSchema = z
  .object({
    visual:           z.string().min(1),
    shot:             z.string().min(1),
    shot_type:        z.enum(['establishing','wide','medium','close_up','extreme_close_up','aerial','pov','over_shoulder','insert']),
    lens:             z.string().min(1),
    lighting:         z.string().min(1),
    camera:           z.string().min(1),
    ambient_sound:    z.string().min(1),
    sfx:              z.string(),
    dialogue:         z.string(),
    avoid:            z.string().min(1),
    connection:       z.string().min(1),
    narration:        z.string().min(0),
    duration_seconds: z.number().int(),
    action_arc:       z.string().optional().default(''),
    in_clip_transition: z.string().optional().default(''),
  })
  .passthrough();

export const storyArcAnalyzerOutputSchema = z
  .object({
    hook_strength:    z.number().int().min(1).max(10),
    curiosity_gap:    z.number().int().min(1).max(10),
    emotional_peaks:  z.number().int().min(1).max(10),
    retention_drops:  z.number().int().min(1).max(10),
    climax_intensity: z.number().int().min(1).max(10),
    overall_score:    z.number().int().min(1).max(100),
    critique:         z.string().min(10),
  })
  .passthrough();

// ─── Story Planning ───────────────────────────────────────────────────────────

export const storyPlanItemSchema = z
  .object({
    name: z.string().min(1),
    concept: z.string().min(1),
  })
  .passthrough();

export const storyPlanAgentOutputSchema = z
  .object({
    story_outline: z.string().min(10),
    character_list: z.array(storyPlanItemSchema).optional(),
    characters: z.array(storyPlanItemSchema).optional(),
    location_list: z.array(storyPlanItemSchema).min(1).optional(),
    locations: z.array(storyPlanItemSchema).min(1).optional(),
    object_list: z.array(storyPlanItemSchema).min(1).optional(),
    objects: z.array(storyPlanItemSchema).min(1).optional(),
    props: z.array(storyPlanItemSchema).min(1).optional(),
    video_type: z.enum(['narrative', 'documentary', 'presenter']).optional().default('documentary'),
  })
  .passthrough()
  .transform((v) => {
     const characters = v.character_list ?? v.characters ?? [];
     const locations = v.location_list ?? v.locations ?? [];
     const objects = v.object_list ?? v.objects ?? v.props ?? [];
     return {
       story_outline: v.story_outline,
       character_list: characters,
       location_list: locations,
       object_list: objects,
       video_type: v.video_type ?? 'documentary',
     };
  });

export const hookScoreSchema = z.object({
  pattern_interrupt: z.number(),
  stakes_clarity: z.number(),
  curiosity_gap: z.number(),
  scroll_stop_power: z.number(),
  overall: z.number(),
  feedback: z.string(),
  suggestions: z.array(z.string()),
});

export const storyAnalysisSchema = z.object({
  phase_analyses: z.array(z.object({
    phase_number: z.number(),
    retention_score: z.number(),
    hook_density: z.number(),
    emotional_intensity: z.number(),
    rehook_present: z.boolean(),
  }).passthrough()),
  overall_retention_score: z.number(),
  dropout_risk_phases: z.array(z.number()),
  peak_moment_phase: z.number(),
  summary: z.string(),
}).passthrough();

export const titleMetadataSchema = z.object({
  titles: z.array(
    z.object({
      text: z.string().max(100),
      structure_type: z.string(),
      char_count: z.number(),
    })
  ),
  description: z.string(),
  chapters: z.array(
    z.object({
      timestamp: z.string(),
      label: z.string(),
    })
  ),
  tags: z.array(z.string()),
  hashtags: z.array(z.string()),
  thumbnail_hook: z.string(),
}).passthrough();

// ─── Continuity Agent Schemas ────────────────────────────────────────────────
export const continuityWarningSchema = z.object({
  prompt_number: z.coerce.string().min(1),
  field: z.string().min(1),
  issue: z.string().min(1),
  suggestion: z.string().min(1)
});

export const continuityAgentOutputSchema = z.object({
  warnings: z.array(continuityWarningSchema)
});

// ─── Scene Agent Schemas ─────────────────────────────────────────────────────
export const visualStateSnapshotSchema = z.object({
  characters_present: z.array(z.object({
    character_id: z.string(),
    current_position: z.string(),
    props_held: z.array(z.string()),
    physical_condition: z.string(),
    facing_direction: z.string()
  })),
  location_state: z.string(),
  time_of_day: z.string(),
  weather_or_atmosphere: z.string(),
  key_objects_visible: z.array(z.string()),
  character_damage: z.record(z.string(), z.string()).optional().default({}),
  costume_armor_state: z.record(z.string(), z.string()).optional().default({}),
  creature_states: z.array(z.object({
    name: z.string(),
    status: z.enum(['unharmed', 'injured', 'defeated', 'dead']),
    powers_active: z.boolean().optional()
  })).optional().default([]),
  environmental_destruction: z.string().optional().default('')
}).nullable();

export const strictVisualStateSnapshotSchema = z.object({
  characters_present: z.array(z.object({
    name: z.string(),
    position: z.string(),
    props: z.array(z.string()),
    physical_condition: z.string(),
    facing_direction: z.string()
  })),
  location_state: z.string(),
  time_of_day: z.string(),
  atmosphere: z.string(),
  key_visible_objects: z.array(z.string()),
  character_damage: z.record(z.string(), z.string()).optional().default({}),
  costume_armor_state: z.record(z.string(), z.string()).optional().default({}),
  creature_states: z.array(z.object({
    name: z.string(),
    status: z.enum(['unharmed', 'injured', 'defeated', 'dead']),
    powers_active: z.boolean().optional()
  })).optional().default([]),
  environmental_destruction: z.string().optional().default('')
});

export const extendedSceneItemSchema = z
  .object({
    scene_number:               z.number().int().min(1),
    title:                      z.string().min(1),
    scene_description:          z.string().min(1),
    continuity_notes:           z.string().optional().default(''),
    narration_fragment:         z.string().min(0),
    character_ids_present:      z.array(z.string()).optional().default([]),
    location_id:                z.string().optional().default('LOC_001'),
    object_ids_featured:        z.array(z.string()).optional().default([]),
    emotional_beat:             z.string().min(1).optional().default('neutral'),
    transition_to_next:         z.string().optional().default('cut'),
    estimated_duration_seconds: z.number().min(1).optional().default(8),
    is_dialogue:                z.boolean().optional().default(false),
    is_action:                  z.boolean().optional().default(false),
    narration_word_count:       z.number().int().min(0).optional(),
    visual_state_snapshot:      strictVisualStateSnapshotSchema,
  })
  .passthrough()
  .transform((v) => {
    const narration = v.narration_fragment ?? '';
    // TODO: Thread language parameter properly. Fallback to English.
    const language = (v as any).language ?? (v as any).narration_language ?? 'English';
    const count = getWordCount(narration, language);
    return {
      ...v,
      continuity_notes:           v.continuity_notes           ?? '',
      character_ids_present:      v.character_ids_present      ?? [],
      location_id:                v.location_id                ?? 'LOC_001',
      object_ids_featured:        v.object_ids_featured        ?? [],
      emotional_beat:             v.emotional_beat             ?? 'neutral',
      transition_to_next:         v.transition_to_next         ?? 'cut',
      estimated_duration_seconds: v.estimated_duration_seconds ?? 8,
      is_dialogue:                v.is_dialogue                ?? false,
      is_action:                  v.is_action                  ?? false,
      narration_word_count:       count,
    };
  });

export const extendedSceneAgentOutputSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) {
      return { scenes: val };
    }
    return val;
  },
  z.object({
    phase_number:    z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
    phaseNumber:     z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
    phase_title:     z.string().min(1).optional(),
    phaseTitle:      z.string().min(1).optional(),
    total_scenes:    z.number().int().min(1).optional(),
    totalScenes:     z.number().int().min(1).optional(),
    scenes:          z.array(extendedSceneItemSchema).min(1).optional(),
    scene_list:      z.array(extendedSceneItemSchema).min(1).optional(),
    scene_breakdown: z.array(extendedSceneItemSchema).min(1).optional(),
  })
  .passthrough()
  .transform((v) => {
    const phaseNum = v.phase_number ?? v.phaseNumber ?? 1;
    const title    = v.phase_title ?? v.phaseTitle ?? 'Untitled Phase';
    const scenes   = v.scenes ?? v.scene_list ?? v.scene_breakdown ?? [];
    const total    = v.total_scenes ?? v.totalScenes ?? scenes.length;
    return {
      phase_number: phaseNum,
      phase_title:  title,
      total_scenes: total,
      scenes:       scenes,
    };
  })
);

// ─── Veo Agent Schemas ───────────────────────────────────────────────────────
export const veoAppearanceValidationSchema = z.object({
  violation: z.boolean(),
  violated_fields: z.array(z.string()),
  corrected_visual: z.string(),
  corrected_lighting: z.string().optional()
});

export const veoExtendedValidationSchema = z.object({
  violation: z.boolean(),
  violations: z.array(
    z.object({
      field: z.enum(['visual', 'lighting', 'shot', 'camera', 'dialogue', 'sfx', 'ambient_sound', 'avoid', 'connection']),
      issue: z.string(),
      suggestion: z.string(),
      rule: z.string(),
      severity: z.enum(['error', 'warning'])
    })
  )
});

// ─── Script Agent Schemas ────────────────────────────────────────────────────
export const scriptExtractionSchema = z.object({
  facts: z.array(z.string()),
  images: z.array(z.string()),
  events: z.array(z.string()),
  characters_used: z.array(z.string()),
});

export const phaseRegenerateSchema = z.object({
  phase_title:   z.string().min(1),
  phase_content: z.string().min(10),
  narration_text: z.string().min(1).optional(),
  rehook_type:   z.enum(['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt']).nullable().optional(),
});

export const validateRehookSchema = z.object({
  validated: z.boolean(),
  detected_type: z.string(),
  reason: z.string(),
});

// ─── Hook Scorer Agent Schemas ───────────────────────────────────────────────
export const localHookScoreSchema = hookScoreSchema.extend({
  hard_stop_violated: z.boolean(),
});

export const conceptTitleSchema = z.object({
  text: z.string().min(1).max(120),
  angle: z.string().optional(),
  click_score: z.number().int().min(1).max(10),
});

export const engagementBlueprintSchema = z.object({
  core_curiosity_question: z.string().min(1),
  hook_strategy: z.string().min(1),
  open_loops: z.array(z.string().min(1)).min(2),
  escalation_logic: z.string().min(1),
  emotional_driver: z.string().min(1),
  payoff: z.string().min(1),
});

export const conceptAgentOutputSchema: z.ZodType<any, any, any> = z.object({
  content_type: z.enum(['documentary','narrative','presenter','montage']),
  project_topic: z.string().min(50).max(1800),
  titles: z.array(conceptTitleSchema).min(6),
  engagement_blueprint: engagementBlueprintSchema,
  target_audience: z.string().optional(),
  suggested_length: z.string().optional(),
  thumbnail_concept: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  content_profile: z.string().optional(),
}).passthrough()
  .transform(v => ({ ...v, titles: [...v.titles].sort((a,b)=>b.click_score-a.click_score).slice(0,10) }));

export const conceptTopicOnlySchema = z.object({
  content_type: z.enum(['documentary','narrative','presenter','montage']),
  project_topic: z.string().min(50).max(1800),
  engagement_blueprint: engagementBlueprintSchema,
  content_profile: z.string().optional(),
}).passthrough();

export const conceptStyleSelectionSchema = z.object({
  mode: z.enum(['existing','new']),
  existing_style_id: z.string().optional(),
  name: z.string().min(2).max(80).optional(),
  description: z.string().min(80).max(2200).optional(),  // the Veo-3.1 rich description
  veo_style_tokens: z.array(z.string()).optional(),
  render_family: z.enum(RenderFamilies).optional(),
  reasoning: z.string().optional(),
}).passthrough();

export type ConceptStyleSelection = z.infer<typeof conceptStyleSelectionSchema>;

export const credibilityIssueSchema = z
  .object({
    phase_number: z.number().int(),
    claim: z.string(),
    issue_type: z.enum([
      'wrong_number',
      'wrong_date',
      'wrong_unit',
      'wrong_distance_or_depth',
      'step_out_of_order',
      'unverifiable',
      'exaggeration',
      'internal_contradiction'
    ]),
    severity: z.enum(['high', 'medium', 'low']),
    explanation: z.string(),
    suggested_correction: z.string().optional()
  })
  .passthrough();

export const credibilityReviewSchema: z.ZodType<any, any, any> = z
  .object({
    overall_credibility_score: z.number().min(1).max(10),
    issues: z.array(credibilityIssueSchema).default([]),
    summary: z.string()
  })
  .passthrough();







