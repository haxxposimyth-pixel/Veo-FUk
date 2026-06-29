import { BaseAgent } from '../agents/base-agent';
import { LOCKED_CORE, CatalogStyle } from '../config/style-catalog';
import { CustomStyleRepository } from '../db/repositories/customstyle.repo';
import { getStyleSelectionPrompt } from '../prompts/concept.prompt';
import { conceptStyleSelectionSchema } from 'shared';
import { z } from 'zod';
import type { ConceptStyleSelection, RenderFamily } from 'shared';
import { VEO_COMFORT, COMFORT_WARNING, RenderFamilies } from 'shared';
import { AGENT_MODEL_MAPPING } from '../config/agent-model-mapping';
import { SettingsRepository } from '../db/repositories/settings.repo';

export interface StyleCuratorResult {
  visual_style: string;
  style_name: string;
  style_id: string;
  render_family: RenderFamily;
  comfort: 'comfortable' | 'workable' | 'avoid';
  origin: 'matched' | 'created';
  warnings: string[];
}

export class StyleCuratorService extends BaseAgent {
  constructor() {
    super('StyleCuratorService');
  }

  async curate(
    brief: any,
    language: string = 'English',
    apiKey?: string,
    opts?: { profileDefaultKey?: string }
  ): Promise<StyleCuratorResult> {
    const resolvedModel = AGENT_MODEL_MAPPING['ConceptAgent'] || 'gemini-2.5-pro';
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';

    // 1. Gather all candidates
    const coreCandidates = LOCKED_CORE.map(style => ({
      id: `preset:${style.key}`,
      name: style.name,
      description: style.description,
      render_family: style.render_family
    }));

    const customCandidates = CustomStyleRepository.findAll().map(style => ({
      id: style.id,
      name: style.name,
      description: style.description,
      render_family: style.render_family || null
    }));

    const candidates = [...coreCandidates, ...customCandidates];

    // 2. Call LLM to select or author style
    const systemPrompt = `You are a senior cinematographer and AI video art director for Google Veo 3.1.
Describe a visual style with focus on motion video, rich shot-to-shot consistency, and cinematic artistry. Output JSON only.`;

    let resolvedProfileDefaultKey = opts?.profileDefaultKey;
    if (resolvedProfileDefaultKey) {
      const matchedPreset = LOCKED_CORE.find(c => c.key === resolvedProfileDefaultKey);
      if (matchedPreset) {
        resolvedProfileDefaultKey = matchedPreset.name;
      }
    }

    const selectionPrompt = getStyleSelectionPrompt(
      brief,
      brief.content_type || 'documentary',
      language,
      candidates,
      resolvedProfileDefaultKey
    );

    const sel = await this.generateStructured<ConceptStyleSelection>(
      null,
      activeApiKey,
      resolvedModel,
      {
        prompt: selectionPrompt,
        systemInstruction: systemPrompt,
        schema: conceptStyleSelectionSchema,
        temperature: 0.7,
        maxOutputTokens: 1500,
      }
    );

    const warnings: string[] = [];

    // 3. Match existing style
    if (sel.mode === 'existing' && sel.existing_style_id) {
      const matched = candidates.find(c => c.id === sel.existing_style_id);
      if (matched) {
        // Load matched style's stored description and verify compatibility
        const compatibility = await this.checkStyleCompatibility(
          brief,
          matched.description,
          activeApiKey,
          resolvedModel
        );

        if (compatibility.compatible) {
          let renderFamily = this.classifyRenderFamily(matched.render_family || '', matched.description);
          const comfort = VEO_COMFORT[renderFamily];
          if (comfort !== 'comfortable') {
            warnings.push(COMFORT_WARNING(renderFamily));
          }

          const isPreset = matched.id.startsWith('preset:');
          return {
            visual_style: matched.description,
            style_name: matched.name,
            style_id: isPreset ? '' : matched.id,
            render_family: renderFamily,
            comfort,
            origin: 'matched',
            warnings
          };
        } else {
          console.warn(`[StyleCuratorService] Rejected matched style "${matched.name}" (ID: ${matched.id}) for incompatibility. Reason: ${compatibility.reason}`);
          warnings.push(`Matched style "${matched.name}" was rejected for subject mismatch. Generating a new style instead.`);

          // Fallback to generating a fresh style description
          const forceNewPrompt = `We need to create a brand new visual style for the project brief because the previous library style was rejected for incompatibility.
The style must be subject-agnostic, describing only technical aesthetic elements (e.g. colors, lighting, camera work, lenses, and film grain) without referencing any specific vehicles, locations, or characters from the brief.

PROJECT BRIEF DETAILS:
- Subject/Topic: ${brief.project_topic}
- Content Type: ${brief.content_type || 'documentary'}
- Core Curiosity: ${brief.engagement_blueprint?.core_curiosity_question || ''}
- Emotional Driver: ${brief.engagement_blueprint?.emotional_driver || ''}
- Narration Language: ${language}

Your JSON response must use mode: "new" and populate the "name", "description", "render_family", and "veo_style_tokens" fields. Do not try to match any existing styles.`;

          try {
            const freshSel = await this.generateStructured<ConceptStyleSelection>(
              null,
              activeApiKey,
              resolvedModel,
              {
                prompt: forceNewPrompt,
                systemInstruction: systemPrompt,
                schema: conceptStyleSelectionSchema,
                temperature: 0.7,
                maxOutputTokens: 1500,
              }
            );
            sel.mode = 'new';
            sel.name = freshSel.name || 'Untitled Style';
            sel.description = freshSel.description || '';
            sel.render_family = freshSel.render_family;
            sel.veo_style_tokens = freshSel.veo_style_tokens;
          } catch (freshErr: any) {
            console.error(`[StyleCuratorService] Failed to generate fresh style fallback: ${freshErr.message}`);
            // Degrade gracefully: set to a default new style
            sel.mode = 'new';
            sel.name = 'Cinematic Realism';
            sel.description = 'A photorealistic live-action cinematic style with neutral lighting, balanced color tones, and stabilized camera movements suitable for documentary explainers.';
            sel.render_family = 'photoreal_cinematic';
            sel.veo_style_tokens = ['cinematic', 'photorealistic', 'balanced lighting'];
          }
        }
      }
    }

    // 4. Create new style
    const newName = sel.name || 'Untitled Style';
    const newDesc = sel.description || '';
    const renderFamily = this.classifyRenderFamily(sel.render_family || '', newDesc);

    // Run Deduplication
    const dedupeMatch = this.dedupe(newName, newDesc, renderFamily, customCandidates, LOCKED_CORE);
    if (dedupeMatch) {
      // Run compatibility check on dedupeMatch description!
      const dedupeCompatibility = await this.checkStyleCompatibility(
        brief,
        dedupeMatch.description,
        activeApiKey,
        resolvedModel
      );

      if (dedupeCompatibility.compatible) {
        const comfort = VEO_COMFORT[dedupeMatch.render_family];
        if (comfort !== 'comfortable') {
          warnings.push(COMFORT_WARNING(dedupeMatch.render_family));
        }
        return {
          visual_style: dedupeMatch.description,
          style_name: dedupeMatch.name,
          style_id: dedupeMatch.isPreset ? '' : dedupeMatch.id,
          render_family: dedupeMatch.render_family,
          comfort,
          origin: 'matched',
          warnings
        };
      } else {
        console.warn(`[StyleCuratorService] Rejected dedupe matched style "${dedupeMatch.name}" (ID: ${dedupeMatch.id}) for incompatibility. Reason: ${dedupeCompatibility.reason}`);
      }
    }

    // Create custom style
    const created = CustomStyleRepository.create(newName.trim(), newDesc.trim(), renderFamily);
    const comfort = VEO_COMFORT[renderFamily];
    if (comfort !== 'comfortable') {
      warnings.push(COMFORT_WARNING(renderFamily));
    }

    return {
      visual_style: created.description,
      style_name: created.name,
      style_id: created.id,
      render_family: renderFamily,
      comfort,
      origin: 'created',
      warnings
    };
  }

  async checkStyleCompatibility(
    brief: any,
    styleDescription: string,
    apiKey: string,
    modelName: string
  ): Promise<{ compatible: boolean; reason: string }> {
    const styleLower = styleDescription.toLowerCase();
    const briefLower = (brief.project_topic || '').toLowerCase();

    // 1. Belt-and-suspenders pre-filter for known mismatch keywords
    const DOMAIN_KEYWORDS: Record<string, string[]> = {
      marine: ['ship','ocean','sea','vessel','ballast tank','ballast','cargo container','container confetti','superstructure','hull','maritime','quay'],
      aviation: ['airplane','aircraft','aviation','flight','cockpit','aerospace','jetliner','boeing','fuselage','runway','hangar'],
      cleanroom_factory: ['cleanroom','clean room','high-bay','assembly line','composite material','semiconductor','fab','gantry'],
      rail: ['train','locomotive','railway','railroad','freight','wagon','hopper','rail track','pantograph','railyard'],
      automotive: ['automobile','engine bay','assembly plant','chassis','showroom'],
      space: ['rocket','spacecraft','launchpad','orbital','satellite','mission control'],
    };

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const styleHasDomain = keywords.some(w => styleLower.includes(w));
      if (styleHasDomain) {
        const briefHasDomain = keywords.some(w => briefLower.includes(w));
        if (!briefHasDomain) {
          return {
            compatible: false,
            reason: `Pre-filter mismatch: style carries '${domain}' subject vocabulary absent from the project brief.`,
          };
        }
      }
    }

    // 2. LLM-based verification
    const systemPrompt = `You are a database integrity validator for an AI video production pipeline.
Your task is to analyze whether an existing visual style description is compatible with a new video project topic.
A visual style is INCOMPATIBLE if its description contains specific, locked subject-matter or environment-specific nouns (e.g. 'ocean', 'ship', 'ballast tanks', 'container cargo', 'aircraft', 'cockpit') that contradict or are foreign to the new project topic.
A visual style is COMPATIBLE if it is subject-agnostic (describing only camera, lens, lighting, color mood, and artistic technique) or if its specific subjects align perfectly with the new topic.
Output JSON only.`;

    const userPrompt = `Compare the following project topic and the proposed visual style description:

PROJECT TOPIC:
"${brief.project_topic}"

PROPOSED VISUAL STYLE DESCRIPTION:
"${styleDescription}"

Determine if this style description contains any subject or environment specifics that are incompatible with the new project topic.
Return a JSON object matching this schema:
{
  "compatible": boolean,
  "reason": "Brief explanation of why it is compatible or incompatible."
}`;

    const schema = z.object({
      compatible: z.boolean(),
      reason: z.string(),
    });

    try {
      const result = await this.generateStructured<{ compatible: boolean; reason: string }>(
        null,
        apiKey,
        modelName,
        {
          prompt: userPrompt,
          systemInstruction: systemPrompt,
          schema,
          temperature: 0.1,
          maxOutputTokens: 500,
        }
      );
      return result;
    } catch (err: any) {
      console.warn(`[StyleCuratorService] Compatibility LLM check failed: ${err.message}. Defaulting to incompatible.`);
      return { compatible: false, reason: `Check failed with error: ${err.message}` };
    }
  }

  classifyRenderFamily(declaredFamily: string, description: string): RenderFamily {
    const cleanDeclared = declaredFamily.toLowerCase().trim();
    if (RenderFamilies.includes(cleanDeclared as any)) {
      return cleanDeclared as RenderFamily;
    }

    const text = description.toLowerCase();

    // Regex classifier
    if (/photoreal|cinematic|realism|real-life|live-action|high-fidelity/i.test(text)) {
      return 'photoreal_cinematic';
    }
    if (/documentary|vérité|verite|handheld|observational|wildlife|nature/i.test(text)) {
      return 'documentary_realism';
    }
    if (/pixar|3d animation|3d animated|character rendering/i.test(text)) {
      return 'pixar_3d';
    }
    if (/stylized 3d|cgi|render|octane|digital art|infographic 3d/i.test(text)) {
      return 'stylized_3d';
    }
    if (/claymation|stopmotion|stop-motion|clay shader/i.test(text)) {
      return 'claymation_stopmotion';
    }
    if (/anime|manga|2d hand-drawn|cel-shaded/i.test(text)) {
      return 'anime_2d';
    }
    if (/painterly|watercolor|storybook|fantasy painting/i.test(text)) {
      return 'painterly_watercolor';
    }
    if (/comic|graphic novel|sketch|hand-drawn ink/i.test(text)) {
      return 'comic_graphic_novel';
    }
    if (/2d vector|corporate memphis|flat vector/i.test(text)) {
      return 'flat_2d_vector';
    }
    if (/motion graphics|infographic animation|after effects/i.test(text)) {
      return 'motion_graphics';
    }
    if (/pixel art|8-bit|16-bit|retro pixel/i.test(text)) {
      return 'pixel_art';
    }

    return 'photoreal_cinematic';
  }

  dedupe(
    newName: string,
    newDesc: string,
    family: RenderFamily,
    customStyles: { id: string; name: string; description: string; render_family?: string | null }[],
    coreStyles: CatalogStyle[]
  ): { id: string; name: string; description: string; render_family: RenderFamily; isPreset: boolean } | null {
    const normalizedNewName = newName.toLowerCase().trim();

    // 1. Exact name match in core
    const exactCore = coreStyles.find(s => s.name.toLowerCase().trim() === normalizedNewName);
    if (exactCore) {
      return {
        id: `preset:${exactCore.key}`,
        name: exactCore.name,
        description: exactCore.description,
        render_family: exactCore.render_family,
        isPreset: true
      };
    }

    // 2. Exact name match in custom styles
    const exactCustom = customStyles.find(s => s.name.toLowerCase().trim() === normalizedNewName);
    if (exactCustom) {
      return {
        id: exactCustom.id,
        name: exactCustom.name,
        description: exactCustom.description,
        render_family: this.classifyRenderFamily(exactCustom.render_family || '', exactCustom.description),
        isPreset: false
      };
    }

    // 3. Overlap check - extract clean words
    const tokenize = (desc: string) => {
      return new Set(
        desc
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3)
      );
    };

    const wordsNew = tokenize(newDesc);
    if (wordsNew.size === 0) return null;

    // Check high word overlap against core styles of same family
    for (const core of coreStyles) {
      if (core.render_family === family) {
        const wordsCore = tokenize(core.description);
        const intersect = [...wordsNew].filter(w => wordsCore.has(w));
        const minSize = Math.min(wordsNew.size, wordsCore.size);
        const ratio = intersect.length / minSize;
        if (ratio >= 0.85) {
          return {
            id: `preset:${core.key}`,
            name: core.name,
            description: core.description,
            render_family: core.render_family,
            isPreset: true
          };
        }
      }
    }

    // Check high word overlap against custom styles of same family
    for (const custom of customStyles) {
      const customFamily = this.classifyRenderFamily(custom.render_family || '', custom.description);
      if (customFamily === family) {
        const wordsCustom = tokenize(custom.description);
        const intersect = [...wordsNew].filter(w => wordsCustom.has(w));
        const minSize = Math.min(wordsNew.size, wordsCustom.size);
        const ratio = intersect.length / minSize;
        if (ratio >= 0.85) {
          return {
            id: custom.id,
            name: custom.name,
            description: custom.description,
            render_family: customFamily,
            isPreset: false
          };
        }
      }
    }

    return null;
  }
}

export const styleCurator = new StyleCuratorService();
