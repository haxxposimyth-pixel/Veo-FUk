import { RenderFamily } from 'shared';

export interface CatalogStyle {
  key: string;
  name: string;
  render_family: RenderFamily;
  render_style: string;
  lighting_style: string;
  camera_movement_style: string;
  veo_style_tokens: string[];
  forbidden_elements: string[];
  color_mood: string;
  description: string;
  color_palette: string[];
  film_grain: boolean;
  aspect_ratio: string;
  film_stock_grade: string;
  lens_family: string;
}

export const LOCKED_CORE: CatalogStyle[] = [
  {
    key: 'photoreal_cinematic',
    name: 'Photoreal Cinematic',
    render_family: 'photoreal_cinematic',
    render_style: 'photorealistic live-action cinematic',
    lighting_style: 'volumetric dramatic three-point lighting, natural light transport',
    camera_movement_style: 'slow controlled tracking shots, cinematic pan and tilt',
    veo_style_tokens: ['cinematic lighting', 'photorealistic', '8k resolution', 'shallow depth of field'],
    forbidden_elements: ['cartoon', 'anime', 'cel-shading', 'flat colors', 'illustration', 'low-poly', 'watermark', 'text overlays'],
    color_mood: 'warm cinematic tone, rich grading',
    description: 'A photorealistic live-action cinematic style with high fidelity, rich natural textures, volumetric shadows, natural light transport, and dramatic three-point lighting. Perfect for high-budget narrative films and premium cinematic content.',
    color_palette: ['#1a1a2e', '#16213e', '#e94560', '#0f3460'],
    film_grain: true,
    aspect_ratio: '16:9',
    film_stock_grade: 'Kodak Vision3 500T',
    lens_family: 'Arri Alexa Prime Lenses'
  },
  {
    key: 'documentary_realism',
    name: 'Documentary Realism',
    render_family: 'documentary_realism',
    render_style: 'photorealistic raw documentary style',
    lighting_style: 'natural light, high-key ambient light, un-staged natural shadows',
    camera_movement_style: 'organic handheld camera work, subtle micro-tremors, observational pans',
    veo_style_tokens: ['documentary', 'handheld', 'natural lighting', 'realistic textures'],
    forbidden_elements: ['cartoon', 'anime', 'cel-shading', 'flat colors', 'illustration', 'low-poly', 'volumetric neon shadows', 'stylized CGI'],
    color_mood: 'neutral grading, realistic color balance',
    description: 'A gritty, raw documentary realism style mimicking observational videography. Uses handheld camera movement, ambient natural lighting, and un-staged natural shadows for absolute credibility and journalistic realism.',
    color_palette: ['#2b2b2b', '#ffffff', '#a8a8a8', '#d4d4d4'],
    film_grain: true,
    aspect_ratio: '16:9',
    film_stock_grade: 'Fuji Superia 400',
    lens_family: 'observational zoom lens'
  },
  {
    key: 'nature_wildlife',
    name: 'Nature/Wildlife',
    render_family: 'documentary_realism',
    render_style: 'photorealistic wildlife documentary',
    lighting_style: 'natural sunlight, golden hour backlighting, soft dappled forest light',
    camera_movement_style: 'smooth tripod-mounted pan, slow telephoto tracking, static observation',
    veo_style_tokens: ['wildlife documentary', 'telephoto lens', 'national geographic style', 'crisp detail'],
    forbidden_elements: ['cartoon', 'anime', 'flat vector', 'studio lighting', 'neon colors', 'watermark', 'text overlays'],
    color_mood: 'vibrant natural colors, lush green and earth tones',
    description: 'A professional nature and wildlife documentary style featuring high-definition natural landscapes and animals. Uses natural sunlight, soft dappled light, and telephoto tracking to achieve premium wildlife channel look.',
    color_palette: ['#2e4016', '#3b5319', '#f0ebd8', '#8c7a6b'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'Clean digital sensor',
    lens_family: '600mm telephoto lens'
  },
  {
    key: 'macro_product',
    name: 'Macro/Product',
    render_family: 'photoreal_cinematic',
    render_style: 'photorealistic extreme close-up macro',
    lighting_style: 'soft studio ring light, diffused side-lighting, macro highlights',
    camera_movement_style: 'ultra-slow macro slider creeps, precision focus pulling, shallow sweep',
    veo_style_tokens: ['macro videography', 'extreme close-up', 'hyper-detailed textures', 'shallow depth of field'],
    forbidden_elements: ['cartoon', 'anime', 'flat colors', 'low-resolution', 'handheld shake', 'dramatic lens distortion'],
    color_mood: 'clean, pristine, high contrast',
    description: 'An extreme close-up macro style featuring hyper-detailed textures, soft ring studio lighting, and ultra-slow precision camera movements. Perfect for showing fine details of food, mechanics, or premium products.',
    color_palette: ['#000000', '#ffffff', '#d4af37', '#e5e5e5'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'Arri Raw Clean',
    lens_family: '100mm macro lens'
  },
  {
    key: 'film_noir_cinematic',
    name: 'Film-Noir Cinematic',
    render_family: 'photoreal_cinematic',
    render_style: 'photorealistic high-contrast noir cinematic',
    lighting_style: 'chiaroscuro lighting, harsh blinds casting shadows, single-source key light',
    camera_movement_style: 'static dramatic angles, low-angle tracking, slow atmospheric creeps',
    veo_style_tokens: ['film noir', 'chiaroscuro', 'high-contrast black and white', 'moody lighting'],
    forbidden_elements: ['bright daylight cheerfulness', 'pastel palettes', 'cartoon', 'flat vector', 'vibrant color'],
    color_mood: 'monochromatic, high-contrast black and white, deep dark shadows',
    description: 'A classic cinematic film-noir style. Features heavy high-contrast chiaroscuro lighting, dark blind patterns, and low-key single-source key light, creating a moody, mysterious atmosphere in black and white.',
    color_palette: ['#000000', '#222222', '#888888', '#ffffff'],
    film_grain: true,
    aspect_ratio: '16:9',
    film_stock_grade: 'Tri-X Black & White Film',
    lens_family: 'Vintage anamorphic lens'
  },
  {
    key: 'vintage_film',
    name: 'Vintage Film',
    render_family: 'photoreal_cinematic',
    render_style: 'vintage 16mm/35mm analog film aesthetic',
    lighting_style: 'warm analog lighting, natural sun leaks, slightly overexposed highlights',
    camera_movement_style: 'gentle analog jitter, mechanical zoom pushes, classic pan and tilt',
    veo_style_tokens: ['vintage film', '16mm aesthetic', 'lens flares', 'chromatic aberration'],
    forbidden_elements: ['ultra-sharp digital rendering', '3D vectors', 'flat art', 'cyberpunk neon', 'modern UI overlays'],
    color_mood: 'desaturated nostalgia, warm sepia undertones, faded shadows',
    description: 'A nostalgic vintage analog film style mimicking 16mm or 35mm film stock. Features gentle jitter, warm sun leaks, chromatic aberration, and faded desaturated colors for a timeless retro look.',
    color_palette: ['#c3a38a', '#8b5e3c', '#4a3b32', '#f4ebe1'],
    film_grain: true,
    aspect_ratio: '4:3',
    film_stock_grade: 'Kodachrome 64',
    lens_family: 'Vintage Super Baltar prime'
  },
  {
    key: 'pixar_style_3d',
    name: 'Pixar-style 3D',
    render_family: 'pixar_3d',
    render_style: 'premium 3d animated character style',
    lighting_style: 'warm stylized key light, colorful ambient fill lights, rim lighting',
    camera_movement_style: 'smooth animated cameras, sweeping cinematic crane movements, expressive pans',
    veo_style_tokens: ['3d animation', 'pixar style', 'character rendering', 'subsurface scattering'],
    forbidden_elements: ['photorealistic live-action', 'gritty real-life footage', 'flat 2d graphics', 'hand-drawn sketch', 'grainy VHS'],
    color_mood: 'vibrant, friendly, whimsical, highly saturated colors',
    description: 'A premium 3D animated style inspired by Pixar films. Features characters with expressive features, subsurface scattering skin/shaders, colorful ambient fills, and smooth cinematic crane movements.',
    color_palette: ['#00b4d8', '#ffb703', '#fb8500', '#219ebc'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'Clean digital render',
    lens_family: 'Virtual cinematic camera'
  },
  {
    key: 'stylized_3d_cgi',
    name: 'Stylized 3D/CGI',
    render_family: 'stylized_3d',
    render_style: 'stylized 3D graphics and CGI art',
    lighting_style: 'highly stylized colored lighting, neon highlights, dramatic ambient glow',
    camera_movement_style: 'dynamic tracking, fast-paced orbits, computerized fly-throughs',
    veo_style_tokens: ['stylized 3d', 'cgi', 'digital art', 'octane render look'],
    forbidden_elements: ['photorealistic live-action', 'gritty documentary realism', '2d hand-drawn', 'flat vector shapes'],
    color_mood: 'hyper-colorized, modern tech mood, neon accents',
    description: 'A stylized 3D/CGI style with highly custom materials, geometric shapes, and octane render look. Uses neon highlights, dramatic ambient glow, and computerized fly-throughs for high-impact visual design.',
    color_palette: ['#7209b7', '#f72585', '#4cc9f0', '#3f37c9'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'Octane Render Engine',
    lens_family: 'Virtual camera'
  },
  {
    key: 'aerial_drone',
    name: 'Aerial/Drone',
    render_family: 'photoreal_cinematic',
    render_style: 'photorealistic high-altitude aerial drone footage',
    lighting_style: 'natural landscape sunlight, long early morning shadows, high-key ambient light',
    camera_movement_style: 'continuous forward flyovers, slow high-altitude orbit, majestic bird-eye view sweep',
    veo_style_tokens: ['aerial drone', 'gimbal stabilization', 'landscape panorama', 'bird-eye view'],
    forbidden_elements: ['cartoon', 'anime', 'cel-shading', 'handheld shake', 'extreme close-up', 'macro detail'],
    color_mood: 'natural landscape tones, rich sky blues and earth greens',
    description: 'A breathtaking high-altitude stabilized drone style. Captures landscape panoramas, bird-eye views, and orbits under natural sunlight, emphasizing scale, depth, and early morning landscape shadows.',
    color_palette: ['#0077b6', '#90e0ef', '#e9c46a', '#2a9d8f'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'DJI Mavic Clean Sensor',
    lens_family: 'Wide-angle landscape lens'
  },
  {
    key: '3d_explainer_environments',
    name: '3D Explainer Environments',
    render_family: 'stylized_3d',
    render_style: 'stylized 3D infographic and explainer graphics',
    lighting_style: 'clean studio softbox lighting, ambient occlusion, minimal shadows',
    camera_movement_style: 'smooth orthogonal panning, isometric angles, isometric zoom transitions',
    veo_style_tokens: ['3d explainer', 'infographic 3d', 'clean geometry', 'ambient occlusion'],
    forbidden_elements: ['photorealistic human footage', 'shaky handheld camera', 'film grain', 'dark horror noir', 'grunge textures'],
    color_mood: 'bright, corporate, clean pastel and white environment',
    description: 'A clean 3D isometric explainer style with minimal shadows, softbox studio lighting, and smooth orthogonal pans. Ideal for informational, educational, and premium technical animations.',
    color_palette: ['#4361ee', '#4cc9f0', '#f72585', '#f8f9fa'],
    film_grain: false,
    aspect_ratio: '16:9',
    film_stock_grade: 'Clean vector-like 3D',
    lens_family: 'Orthographic camera'
  }
];
