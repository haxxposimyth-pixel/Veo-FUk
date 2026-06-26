import { BaseAgent } from './base-agent';
import { getBibleSystemPrompt, getBibleUserPrompt } from '../prompts/production-bible.prompt';
import { productionBibleAgentOutputSchema, resolveContentProfile } from 'shared';
import type { ProductionBibleData } from 'shared';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { z } from 'zod';
import db from '../db/connection';
import crypto from 'crypto';
import { GeminiService } from '../services/gemini.service';
import { SettingsRepository } from '../db/repositories/settings.repo';

export async function getProductBrandIfBranded(
  topic: string,
  title: string | undefined,
  apiKey: string | undefined,
  modelName?: string
): Promise<string | null> {
  const text = `${topic} ${title || ''}`.toLowerCase();
  const knownBrands = [
    'sting', 'coca-cola', 'coke', 'pepsi', 'red bull', 'monster energy', 'iphone', 'nike', 'adidas', 'starbucks', 
    'soda', 'beverage', 'energy drink', 'sneaker', 'smartphone'
  ];
  for (const brand of knownBrands) {
    if (text.includes(brand)) {
      if (brand === 'sting') return 'Sting energy drink';
      if (brand === 'coke' || brand === 'coca-cola') return 'Coca-Cola';
      if (brand === 'pepsi') return 'Pepsi';
      if (brand === 'red bull') return 'Red Bull energy drink';
      if (brand === 'monster energy') return 'Monster Energy drink';
      if (brand === 'iphone') return 'iPhone';
      return brand;
    }
  }

  try {
    const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';
    if (!activeApiKey) return null;

    const settings = SettingsRepository.getSettings();
    const isVertex = settings.vertexEnabled === true;
    const geminiService = new GeminiService(activeApiKey);
    if (isVertex) {
      const gcpProjectId = settings.gcpProjectId;
      const gcpLocation = settings.gcpLocation || 'us-central1';
      if (gcpProjectId) {
        geminiService.initVertexAI(gcpProjectId, gcpLocation);
      }
    }

    const schema: z.ZodType<any, any, any> = z.object({
      result: z.string().optional(),
      brand: z.string().optional(),
      brand_name: z.string().optional(),
      product_name: z.string().optional(),
      canonical_name: z.string().optional()
    }).transform((data) => {
      const val = data.result ?? data.brand ?? data.brand_name ?? data.product_name ?? data.canonical_name;
      return {
        result: val || 'NONE'
      };
    });

    const classificationPrompt = `Analyze this video topic and title:
Topic: "${topic}"
Title: "${title || ''}"

Does this video topic/title center on a specific real-world commercial product or brand?
If yes, return ONLY its canonical product name (e.g. 'Sting energy drink').
If it is a generic category or non-product topic, return NONE.

Return the result in a JSON object with the key "result", like:
{
  "result": "Sting energy drink"
}
or
{
  "result": "NONE"
}`;

    const response = await geminiService.generateJSON(
      modelName || settings.model || 'gemini-2.5-flash',
      classificationPrompt,
      schema,
      { temperature: 0.1, maxOutputTokens: 100 }
    );

    const result = response?.data?.result?.trim();
    if (result && result.toUpperCase() !== 'NONE') {
      return result;
    }
  } catch (err) {
    console.warn('[getProductBrandIfBranded] LLM product detection failed:', err);
  }

  return null;
}

function applyBibleSystemPromptModifications(prompt: string): string {
  let normalized = prompt.replace(/\r\n/g, '\n');



  const targetInstructions = `7. Return ONLY raw JSON — no markdown fences, no prose before or after.`;
  const replacementInstructions = `7. Return ONLY raw JSON — no markdown fences, no prose before or after.

CHARACTER APPEARANCE LOCK — MANDATORY FOR EVERY CHARACTER:
For each character in the character_roster, you must generate a complete appearance_lock object. These values are permanent and will be injected into every scene prompt that features this character. They cannot be changed by any downstream agent.

Rules for generating appearance_lock:
1. Base all appearance details on the character's historical era, cultural origin, social role, and species type.
2. Be specific. 'Brown hair' is rejected. 'Dark chestnut hair cropped short at the ears, worn under a black wool cap' is accepted.
3. For character_type, choose: 'human', 'creature', 'animal', 'robot', 'object', or 'abstract'.
4. physical_description is required and must detail the physical look (e.g. scales, wings, metallic chassis, body shapes). 
5. For non-human characters (creature, robot, animal, object, etc.), do NOT force human properties like ethnicity, skin_tone, hair, or eyes if they don't apply. Leave them blank or null or describe them only if they exist on the creature (e.g. glowing optical sensors for robot eyes).
6. style_notes must detail how this character renders in the chosen style (e.g. 'Pixar-style soft clay shader, large expressive eyes', '2D hand-drawn cel-shaded linework').
7. clothing_era must be historically or narratively accurate to the character's period and region.
8. forbidden_appearance_changes must list at least 3 specific things that would break visual continuity if they appeared.
9. The appearance_lock must be consistent with any YouTube transcript or style preset provided. If a character was described visually in the transcript, match it exactly.

VISUAL STYLE FORBIDDEN ELEMENTS INFERENCE (MANDATORY):
For the visual_style_lock, the agent must infer what specific elements, rendering techniques, or camera/lighting styles would break/clash with the chosen visual style (e.g., for "watercolor storybook": photorealism, hard CGI lighting, lens flares, gradients, neon colors, 3D shadows; for "Cinematic Realism": cartoon, anime, cel-shading, flat colors, illustration, low-poly, watermark, text overlays; for "Sci-Fi Noir": bright daylight cheerfulness, pastel palettes, cartoon, flat vector, documentary handheld realism).
You MUST populate the "forbidden_elements" array inside "visual_style_lock" with 5-8 of these style-breaking elements. Make sure they are specific to the chosen visual style, representing elements that would destroy the aesthetic coherence of that style if present.`;

  normalized = normalized.replace(targetInstructions, replacementInstructions);

  const targetExample = `"appearance_lock": {
        "character_type": "human | creature | animal | robot | object | abstract",
        "physical_description": "string detailing exact physical structure, species details, wings, robotic features, scales",
        "style_notes": "string describing how this character renders in the chosen style (e.g. 'Pixar-style soft clay shader, large expressive eyes')",
        "ethnicity": "string (optional, human only)",
        "approximate_age": "string (optional)",
        "gender": "string (optional)",
        "skin_tone": "string (optional, human only)",
        "hair": "string (optional, human only)",
        "eyes": "string (optional)",
        "face_structure": "string (optional)",
        "distinguishing_features": "string (optional)",
        "primary_clothing": "string (optional)",
        "clothing_colors": ["string"] (optional),
        "clothing_era": "string (optional)",
        "accessories": "string (optional)",
        "forbidden_appearance_changes": ["string"]
      }`;

  const replacementExample = `"appearance_lock": {
        "character_type": "human",
        "physical_description": "human female, athletic build, defined jawline",
        "style_notes": "Pixar-style 3D render, warm skin tone subsurface scattering, expressive large eyes",
        "ethnicity": "East Asian",
        "approximate_age": "early twenties",
        "gender": "female",
        "skin_tone": "warm olive, smooth texture",
        "hair": "pitch black, styled in a tight high ponytail",
        "eyes": "dark brown, almond-shaped",
        "face_structure": "high cheekbones, small pointed chin",
        "distinguishing_features": "a small silver stud in left nostril",
        "primary_clothing": "traditional silk cheongsam updated with modern cutouts",
        "clothing_colors": ["crimson red", "gold accents"],
        "clothing_era": "cyberpunk ancient China hybrid",
        "accessories": "pair of gold hoop earrings",
        "forbidden_appearance_changes": ["hair must never be down", "ponytail must remain black", "nose stud must stay in place"]
      }`;

  normalized = normalized.replace(targetExample, replacementExample);

  // Replace object_registry example in required JSON structure
  const targetObjectExample = `"object_registry": [\n    {\n      "id": "OBJ_001",\n      "name": "string",\n      "description": "string",\n      "symbolic_meaning": "string",\n      "screen_time": "string"\n    }\n  ]`;

  const replacementObjectExample = `"object_registry": [\n    {\n      "id": "OBJ_001",\n      "object_id": "OBJ_001",\n      "name": "string",\n      "category": "string",\n      "owner_or_location": "string",\n      "visual_description": "string",\n      "default_state": "string",\n      "active_state": "string",\n      "forbidden_variations": ["string"]\n    }\n  ]`;

  normalized = normalized.replace(targetObjectExample, replacementObjectExample);

  return normalized;
}

export class ProductionBibleAgent extends BaseAgent {
  constructor() {
    super('ProductionBibleAgent');
  }

  /**
   * Generates the Production Bible for a project.
   */
  async run(
    topic: string,
    visualStyle: string,
    language: string,
    aspectRatio: string,
    projectId: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    youtubeTranscript?: string,
    storyPlan?: any,
  ): Promise<ProductionBibleData> {
    const proj = ProjectRepository.findById(projectId);
    const profileKey = proj?.content_profile || 'viral_story';
    const profile = resolveContentProfile(profileKey);

    let profileTreatment: 'factual' | 'explainer' | 'narrative' = 'narrative';
    if (profile.id === 'documentary' || profile.id === 'industry_profile' || profile.arcTemplate === '3-act-documentary') {
      profileTreatment = 'factual';
    } else if (profile.id === 'tutorial' || profile.id === 'listicle' || profile.id === 'product_showcase' || profile.arcTemplate === 'tutorial' || profile.arcTemplate === 'listicle') {
      profileTreatment = 'explainer';
    }

    let resolvedVideoType = 'documentary';
    if (storyPlan?.video_type && storyPlan.video_type !== 'auto') {
      resolvedVideoType = storyPlan.video_type;
    } else {
      if (proj && proj.content_type && proj.content_type !== 'auto') {
        resolvedVideoType = proj.content_type;
      } else if (storyPlan?.character_list && Array.isArray(storyPlan.character_list) && storyPlan.character_list.length > 0) {
        resolvedVideoType = storyPlan.character_list.length === 1 ? 'presenter' : 'narrative';
      }
    }

    let groundedProductFacts: string | undefined = undefined;
    const detectedBrand = await getProductBrandIfBranded(topic, proj?.title, apiKey, modelName);
    if (detectedBrand) {
      console.info(`[ProductionBibleAgent] Detected branded commercial product "${detectedBrand}", running grounded search...`);
      try {
        const activeApiKey = apiKey || SettingsRepository.getSettings().apiKey || '';
        if (activeApiKey) {
          const geminiService = new GeminiService(activeApiKey);
          const researchPrompt = `Search for official branding details of: ${detectedBrand}. Focus on packaging/can-or-bottle shape, official color hexes, logo motif, and wordmark.`;
          const researchResult = await geminiService.generateGroundedText(
            modelName || 'gemini-2.5-pro',
            researchPrompt,
            activeApiKey
          );
          if (researchResult) {
            groundedProductFacts = researchResult.text;
            console.info(`[ProductionBibleAgent] Branded product search succeeded.`);
          }
        }
      } catch (err) {
        console.warn(`[ProductionBibleAgent] Branded product search failed:`, err);
      }
    }

    const systemPrompt = applyBibleSystemPromptModifications(getBibleSystemPrompt());
    const userPrompt   = getBibleUserPrompt(topic, visualStyle, language, aspectRatio, youtubeTranscript, storyPlan, resolvedVideoType, profileTreatment, groundedProductFacts);

    const bibleData = await this.generateStructured<ProductionBibleData>(
      projectId,
      apiKey,
      modelName,
      {
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        schema: productionBibleAgentOutputSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk,
    );

    if (bibleData.visual_style_lock) {
      bibleData.visual_style_lock.style_name = visualStyle;
    }

    bibleData.meta = bibleData.meta || {};
    bibleData.meta.language = language; // requested narration language is authoritative

    // Check if repair pass is needed based on story relevance
    const currentRegistry = bibleData.object_registry || [];
    const registeredNames = new Set(currentRegistry.map(o => (o.name || '').toLowerCase().trim()));

    let missingPlanObject = false;
    if (storyPlan?.object_list && Array.isArray(storyPlan.object_list)) {
      for (const planObj of storyPlan.object_list) {
        const nameClean = (planObj.name || '').toLowerCase().trim();
        if (nameClean && !registeredNames.has(nameClean)) {
          missingPlanObject = true;
          break;
        }
      }
    }

    let missingReferencedProp = false;
    if (bibleData.character_roster) {
      for (const char of bibleData.character_roster) {
        const acc = (char.appearance_lock?.accessories || '').toLowerCase().trim();
        if (acc && acc !== 'none' && acc !== 'n/a') {
          let found = false;
          for (const name of registeredNames) {
            if (acc.includes(name) || name.includes(acc)) {
              found = true;
              break;
            }
          }
          if (!found) {
            missingReferencedProp = true;
            break;
          }
        }
      }
    }

    const needsRepair = missingPlanObject || missingReferencedProp || (currentRegistry.length === 0 && ((storyPlan?.object_list && storyPlan.object_list.length > 0) || (bibleData.character_roster && bibleData.character_roster.length > 0)));

    if (needsRepair) {
      console.info(`[ProductionBibleAgent] Object registry has missing story-relevance objects, triggering repair pass...`);
      try {
        const repairOutput = await this.repairObjectRegistry(
          projectId,
          apiKey,
          modelName,
          bibleData.character_roster || [],
          bibleData.location_roster || [],
          currentRegistry,
          config,
          onChunk
        );

        // Merge the returned entries with the existing object_registry (deduplicate by name)
        const mergedRegistry = [...currentRegistry];
        const existingNames = new Set(currentRegistry.map(o => (o.name || '').toLowerCase().trim()));
        for (const item of repairOutput) {
          const nameClean = (item.name || '').toLowerCase().trim();
          if (nameClean && !existingNames.has(nameClean)) {
            mergedRegistry.push(item);
            existingNames.add(nameClean);
          }
        }
        bibleData.object_registry = mergedRegistry;

        // Save the merged registry to the production_bibles table
        BibleRepository.createOrUpdate(projectId, bibleData);

        // Log this repair call to agent_logs with agent_name: 'ProductionBibleAgent_ObjectRepair'
        try {
          db.prepare(`
            INSERT INTO agent_logs (id, project_id, agent_name, model_used, status, input_prompt, output_response)
            VALUES (?, ?, ?, ?, 'success', ?, ?)
          `).run(
            crypto.randomUUID(),
            projectId,
            'ProductionBibleAgent_ObjectRepair',
            modelName || 'gemini-2.5-pro',
            `Objects before repair: ${currentRegistry.length}. Repairing...`,
            `Deduplicated and merged registry. New size: ${mergedRegistry.length}`
          );
        } catch (logErr: any) {
          console.error(`[ProductionBibleAgent] Failed to log repair: ${logErr.message}`);
        }

      } catch (err: any) {
        console.error(`[ProductionBibleAgent] Object repair pass failed: ${err.message}`);
        throw err;
      }
    }

    return bibleData;
  }

  /**
   * Runs the secondary repair pass to bring object count to at least 20 entries.
   */
  async repairObjectRegistry(
    projectId: string,
    apiKey: string | undefined,
    modelName: string | undefined,
    characterRoster: any[],
    locationRoster: any[],
    currentRegistry: any[],
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void
  ): Promise<any[]> {
    const prompt = `Review the character_roster (especially appearance_lock fields) and location_roster (especially visual_lock signature_elements fields) and ensure all hero props and recurring story-critical objects referenced in those locks are registered in the object_registry. If any are missing, add them as new registry entries. Return ONLY the complete updated object_registry array as valid JSON, including all original entries plus the new ones. Do not remove any existing entries.

CONTEXT:
Character Roster:
${JSON.stringify(characterRoster, null, 2)}

Location Roster:
${JSON.stringify(locationRoster, null, 2)}

Current Object Registry:
${JSON.stringify(currentRegistry, null, 2)}

Return ONLY valid JSON matching the schema (array of objects). No markdown fences, no explanation.`;

    const schema = z.array(z.object({
      id: z.string().optional(),
      object_id: z.string().optional(),
      name: z.string().min(1),
      category: z.string().min(1).optional(),
      owner_or_location: z.string().min(1).optional(),
      visual_description: z.string().min(1).optional(),
      default_state: z.string().min(1).optional(),
      active_state: z.string().min(1).optional(),
      forbidden_variations: z.array(z.string()).optional(),
      description: z.string().min(1).optional(),
      symbolic_meaning: z.string().min(1).optional(),
      screen_time: z.string().min(1).optional(),
    }).passthrough());

    const oldName = this.agentName;
    (this as any).agentName = 'ProductionBibleAgent_ObjectRepair';
    try {
      const result = await this.generateStructured<any[]>(
        projectId,
        apiKey,
        modelName,
        {
          prompt,
          schema,
          temperature: config?.temperature ?? 0.7,
          maxOutputTokens: config?.maxOutputTokens ?? 8192,
        },
        onChunk
      );
      return result;
    } finally {
      (this as any).agentName = oldName;
    }
  }
}

// Singleton — imported by the route handler
export const productionBibleAgent = new ProductionBibleAgent();
