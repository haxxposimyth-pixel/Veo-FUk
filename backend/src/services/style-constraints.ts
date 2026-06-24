import type { VisualStyleLock } from 'shared';

export interface StyleConstraintResult {
  systemInstructionBlock: string;
  avoidKeywords: string[];
}

export const STYLE_PRESETS: Record<string, { systemInstructionBlock: string; avoidKeywords: string[] }> = {
  'cinematic realism': {
    avoidKeywords: ['cartoon', 'anime', 'cel-shading', 'flat colors', 'illustration', 'low-poly', 'watermark', 'text overlays'],
    systemInstructionBlock: `STRICT VISUAL STYLE NEGATIVE CONSTRAINTS (HARD RULE):
The visual style of this project is locked to Cinematic Realism.
You MUST strictly avoid any non-photorealistic, flat, or cartoonish elements.
Specifically, DO NOT use: cartoon, anime, cel-shading, flat colors, illustration, low-poly, watermark, or text overlays.
Your visual description and lighting details must describe realistic environments, realistic camera lenses, deep textures, volumetric shadows, natural light transport, and cinematic lighting. You MUST add these forbidden terms to the 'avoid' field.`
  },
  'sci-fi noir': {
    avoidKeywords: ['bright daylight cheerfulness', 'pastel palettes', 'cartoon', 'flat vector', 'documentary handheld realism'],
    systemInstructionBlock: `STRICT VISUAL STYLE NEGATIVE CONSTRAINTS (HARD RULE):
The visual style of this project is locked to Sci-Fi Noir.
You MUST strictly adhere to the Sci-Fi Noir aesthetic.
Specifically, DO NOT use: bright daylight cheerfulness, pastel palettes, cartoon, flat vector, or documentary handheld realism.
Lighting must be high-contrast, moody, chiaroscuro, or neon-lit with deep shadows. Avoid documentary-style handheld camera shaking or flat shapes. You MUST add these forbidden terms to the 'avoid' field.`
  },
  'flat 2d/vector': {
    avoidKeywords: [
      'photorealistic textures',
      '3D shadows',
      'holographic effects',
      'realistic lighting on face',
      'documentary-style',
      'depth of field',
      'gradients'
    ],
    systemInstructionBlock: `STRICT VISUAL STYLE NEGATIVE CONSTRAINTS (HARD RULE):
The visual style of this project is locked to Flat 2D vector / Corporate Memphis style.
You MUST strictly avoid any 3D, realistic, gradient, or depth-of-field terms.
Specifically, DO NOT use: photorealistic textures, 3D shadows, holographic effects, realistic lighting on face, documentary-style, depth of field, or gradients.
Your visual description and lighting details must describe flat 2D shapes, solid color blocks, and bold outlines only. No realistic lighting or volumetric shadows are allowed. You MUST add these forbidden terms to the 'avoid' field.`
  }
};

export function getStyleConstraints(visualStyleLock: any): StyleConstraintResult {
  const lock = visualStyleLock || {};
  
  // 1. Resolve style name
  const name = (lock.style_name || lock.visual_style || '').toLowerCase().trim();
  const desc = (lock.description || '').toLowerCase().trim();
  const tokens = Array.isArray(lock.veo_style_tokens) ? lock.veo_style_tokens.map((t: any) => String(t).toLowerCase()) : [];

  let matchedKey: string | null = null;

  // Exact match first
  if (STYLE_PRESETS[name]) {
    matchedKey = name;
  } else {
    // Regex matching
    if (/2d|vector|memphis|flat/i.test(name) || /2d|vector|memphis|flat/i.test(desc) || tokens.some((t: string) => /2d|vector|memphis|flat/i.test(t))) {
      matchedKey = 'flat 2d/vector';
    } else if (/cinematic|realism|real/i.test(name) || /cinematic|realism|real/i.test(desc) || tokens.some((t: string) => /cinematic|realism/i.test(t))) {
      matchedKey = 'cinematic realism';
    } else if (/sci-fi|noir|cyberpunk/i.test(name) || /sci-fi|noir|cyberpunk/i.test(desc) || tokens.some((t: string) => /sci-fi|noir/i.test(t))) {
      matchedKey = 'sci-fi noir';
    }
  }

  // 2. Fetch matched preset constraints
  const preset = matchedKey ? STYLE_PRESETS[matchedKey] : null;
  const presetAvoids = preset ? preset.avoidKeywords : [];
  
  // 3. Extract custom forbidden elements
  const customForbidden = Array.isArray(lock.forbidden_elements) ? lock.forbidden_elements.map((el: any) => String(el).trim()).filter(Boolean) : [];

  // 4. Merge and deduplicate (case-insensitively, keeping first casing)
  const mergedKeywords: string[] = [];
  const seen = new Set<string>();

  for (const keyword of [...presetAvoids, ...customForbidden]) {
    const lower = keyword.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      mergedKeywords.push(keyword);
    }
  }

  // 5. Build system instruction block
  let systemInstructionBlock = '';
  if (preset) {
    systemInstructionBlock = preset.systemInstructionBlock;
  } else if (customForbidden.length > 0) {
    systemInstructionBlock = `STRICT VISUAL STYLE NEGATIVE CONSTRAINTS (HARD RULE):
The visual style of this project is custom.
You MUST strictly avoid the following forbidden elements: ${customForbidden.join(', ')}.
You MUST add these forbidden terms to the 'avoid' field.`;
  }

  return {
    systemInstructionBlock,
    avoidKeywords: mergedKeywords
  };
}
