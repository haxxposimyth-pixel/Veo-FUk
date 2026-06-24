export const RenderFamilies = [
  'photoreal_cinematic',
  'documentary_realism',
  'stylized_3d',
  'pixar_3d',
  'claymation_stopmotion',
  'anime_2d',
  'painterly_watercolor',
  'comic_graphic_novel',
  'flat_2d_vector',
  'motion_graphics',
  'pixel_art'
] as const;

export type RenderFamily = typeof RenderFamilies[number];

export const VEO_COMFORT: Record<RenderFamily, 'comfortable' | 'workable' | 'avoid'> = {
  photoreal_cinematic: 'comfortable',
  documentary_realism: 'comfortable',
  stylized_3d: 'comfortable',
  pixar_3d: 'comfortable',
  claymation_stopmotion: 'workable',
  anime_2d: 'workable',
  painterly_watercolor: 'workable',
  comic_graphic_novel: 'workable',
  flat_2d_vector: 'avoid',
  motion_graphics: 'avoid',
  pixel_art: 'avoid',
};

export function COMFORT_WARNING(family: RenderFamily): string {
  switch (family) {
    case 'flat_2d_vector':
      return "⚠️ Veo renders flat 2D/vector unreliably — expect inconsistency or unwanted 3D depth.";
    case 'motion_graphics':
      return "⚠️ Veo renders motion graphics unreliably — expect static elements or unexpected artifacts.";
    case 'pixel_art':
      return "⚠️ Veo renders pixel art unreliably — expect modern high-res scaling artifacts.";
    default:
      return `⚠️ Veo might render this style (${family}) with lower fidelity or style drift.`;
  }
}
