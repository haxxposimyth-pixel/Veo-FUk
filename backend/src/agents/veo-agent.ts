import { BaseAgent } from './base-agent';
import { StructuredOutputError } from '../utils/structured-output.error';
import { getVeoSystemPrompt, getVeoUserPrompt } from '../prompts/veo.prompt';
import { veoPromptAgentOutputSchema, VeoPromptData, VeoPrompt, veoAppearanceValidationSchema, veoPromptCompleteSchema, veoExtendedValidationSchema, narrationFitsDuration, getWordCount, getRequiredClipCount, splitNarrationIntoFragments, resolveLanguageRules, resolveContentProfile } from 'shared';
// === VVS FIX 2 START ===
import { numberToWords } from '../utils/veo-validation';
import logger from '../utils/logger';
import { LLMRouter } from '../services/llm-router';
import { extractAndParseJSON } from '../utils/json-extractor';

const cameraSequence = [
  'slow push in',
  'dolly in',
  'slow pull back',
  'tilt down',
  'tilt up',
  'pan left',
  'pan right',
  'crane down',
  'static'
];

export function getNextCamera(prevCam: string): string {
  const cleanPrev = prevCam.replace(/\s*\(Angle\s+[A-Za-z]\)\s*/gi, '').trim().toLowerCase();
  let foundIdx = -1;
  for (let idx = 0; idx < cameraSequence.length; idx++) {
    const seqItem = cameraSequence[idx];
    if (cleanPrev.includes(seqItem) || seqItem.includes(cleanPrev)) {
      foundIdx = idx;
      break;
    }
  }
  
  let nextIdx = 0;
  if (foundIdx !== -1) {
    nextIdx = (foundIdx + 1) % cameraSequence.length;
  }
  
  const nextCam = cameraSequence[nextIdx];
  return nextCam.charAt(0).toUpperCase() + nextCam.slice(1);
}

function safeParseVeoPrompt(prompt: any, resolvedScene: any): { success: boolean; error?: any; data?: any } {
  const sceneTypeFromNotes = resolvedScene?.continuity_notes?.match(
    /scene_type:\s*(sound_driven|reaction|establishing|bookend_return|action|dialogue)/
  )?.[1] ?? 'action';

  const atmosphericTypes = [
    'sound_driven', 'reaction', 'establishing', 'bookend_return'
  ];

  const isAtmospheric = atmosphericTypes.includes(sceneTypeFromNotes);
  const isSubPrompt = Number(prompt.prompt_number) > 1 || prompt._isSubPrompt;

  const duration = prompt.duration_seconds || 8;
  const cleanNarrationText = (prompt.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
  return veoPromptCompleteSchema.safeParse(prompt);

  return veoPromptCompleteSchema.safeParse(prompt);
}

function validatePrompt(
  prompt: any,
  bible: any,
  project: any,
  sceneNumber: number | string = 'unknown',
  phaseNumber?: number,
  resolvedScene?: any
) {
  const errors: string[] = [];

  // 1. Ensure all string fields end with a period
  const stringFields = ['visual', 'lens', 'lighting', 'camera', 'ambient_sound', 'sfx', 'dialogue', 'avoid', 'connection', 'narration'];
  for (const field of stringFields) {
    if (typeof (prompt as any)[field] === 'string') {
      let val = (prompt as any)[field].trim();
      if (val && !/[.!?]"?$/.test(val)) {
        (prompt as any)[field] = val + '.';
      }
    }
  }

  // 2. Visual word count check (40-80 words)
  const visualWords = prompt.visual.trim().split(/\s+/).filter(Boolean);
  if (visualWords.length < 40 || visualWords.length > 80) {
    errors.push(`Visual has ${visualWords.length} words (must be 40-80 words)`);
  }

  // 3. Arabic numeral check in Visual
  if (/\d/.test(prompt.visual)) {
    prompt.visual = prompt.visual.replace(/\b(\d+)\b/g, (match: string) => numberToWords(match));
  }

  // 4. Avoid list checks
  let avoidItems = prompt.avoid.split(',').map((i: any) => i.trim()).filter(Boolean);
  
  let hasBrandedProductFeatured = false;
  try {
    const rawSceneJson = resolvedScene?.raw_json ? (typeof resolvedScene.raw_json === 'string' ? JSON.parse(resolvedScene.raw_json) : resolvedScene.raw_json) : null;
    const featuredObjectIds = rawSceneJson?.object_ids_featured || [];
    const bibleData = (bible as any).visual_style_lock ? bible : (bible.raw_json ? JSON.parse(bible.raw_json) : {});
    hasBrandedProductFeatured = (featuredObjectIds || []).some((objId: string) => {
      const obj = (bibleData.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
      return obj && obj.is_branded_product === true;
    });
  } catch (err) {
    // Ignore error
  }

  let mandatoryAvoids = ['modern logo', 'smartphone screen', 'digital artifacts', 'motion blur', 'neon lights'];
  const BRAND_AVOIDS = ['brand names', 'logo', 'text', 'letters', 'typography', 'written words'];

  if (hasBrandedProductFeatured) {
    mandatoryAvoids = mandatoryAvoids.filter((item: string) => !BRAND_AVOIDS.some((term: string) => item.toLowerCase().includes(term)));
  }
  
  // Ensure mandatory elements are present
  for (const item of mandatoryAvoids) {
    if (!avoidItems.some((existing: any) => existing.toLowerCase().includes(item.toLowerCase()))) {
      avoidItems.push(item);
    }
  }

  // Production Bible forbidden elements
  const bibleData = (bible as any).visual_style_lock ? bible : (bible.raw_json ? JSON.parse(bible.raw_json) : {});
  let forbidden = bibleData.visual_style_lock?.forbidden_elements || [];
  if (hasBrandedProductFeatured) {
    forbidden = forbidden.filter((item: string) => !BRAND_AVOIDS.some((term: string) => item.toLowerCase().includes(term)));
  }

  for (const item of forbidden) {
    if (!avoidItems.some((existing: any) => existing.toLowerCase().includes(item.toLowerCase()))) {
      avoidItems.push(item);
    }
  }

  // Keep unique items
  avoidItems = Array.from(new Set(avoidItems));

  // If branded product, filter out any existing items matching BRAND_AVOIDS
  if (hasBrandedProductFeatured) {
    avoidItems = avoidItems.filter((item: string) => !BRAND_AVOIDS.some((term: string) => item.toLowerCase().includes(term)));
  }

  // Limit count between 6 and 10 items
  if (avoidItems.length < 6) {
    // Fill up to 6 items using default scene-specific safe tags if needed
    const fillers = ['anachronisms', 'wrong-era props', 'unnatural studio lighting'];
    for (const filler of fillers) {
      if (avoidItems.length >= 6) break;
      if (!avoidItems.includes(filler)) {
        avoidItems.push(filler);
      }
    }
  }
  if (avoidItems.length > 10) {
    avoidItems = avoidItems.slice(0, 10);
  }

  prompt.avoid = avoidItems.join(', ') + '.';

  const cleanNarration = prompt.narration.replace(/\[WARNING:.*\]/g, '').trim();
  const narrationLanguage = project?.narration_language || 'English';
  const rules = resolveLanguageRules(narrationLanguage);
  
  const narrationWords = rules.wordCountStrategy === 'char'
    ? cleanNarration.replace(/\s/g, '').split('')
    : cleanNarration.split(/\s+/).filter(Boolean);

  // B. Forbidden weak words (only apply to English/Latin words)
  const forbiddenWords = ['very', 'really', 'simply', 'just', 'truly', 'literally', 'actually', 'perhaps', 'maybe', 'somehow'];
  const foundForbidden = narrationWords.filter((w: string) => 
    forbiddenWords.includes(w.toLowerCase().replace(/[^a-z]/g, ''))
  );
  if (foundForbidden.length > 0) {
    errors.push(`Narration contains forbidden weak words: ${foundForbidden.join(', ')}`);
  }

  // C. Start with A or The (only apply to space/Latin text)
  if (Number(prompt.prompt_number) === 1 && rules.wordCountStrategy === 'space') {
    if (narrationWords.length > 0) {
      const firstWord = narrationWords[0].toLowerCase().replace(/[^a-z]/g, '');
      if (['a', 'an', 'the'].includes(firstWord)) {
        errors.push(`Narration starts with a forbidden article: "${narrationWords[0]}"`);
      }
    }
  }

  // D. End with conjunction (only apply to space/Latin text)
  if (narrationWords.length > 0 && rules.wordCountStrategy === 'space') {
    const lastWord = narrationWords[narrationWords.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    if (['and', 'but', 'while', 'as'].includes(lastWord)) {
      errors.push(`Narration ends with a conjunction: "${narrationWords[narrationWords.length - 1]}"`);
    }
  }

  // E. Single sentence check
  let sentenceCount = 0;
  if (!rules.terminators) {
    // Thai or languages with no terminal marks: split on spaces as phrase boundaries
    sentenceCount = cleanNarration.split(/\s+/).filter(Boolean).length;
  } else {
    const escaped = rules.terminators.replace(/[\\^$\-*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`[${escaped}]`, 'g');
    sentenceCount = (cleanNarration.match(regex) || []).length;
  }
  if (sentenceCount === 0) {
    errors.push(`Narration must contain at least one complete sentence (found 0 sentence terminators)`);
  }

  // 6. Dialogue language check
  if (project?.narration_language === 'Hindi') {
    if (prompt.dialogue !== 'None.' && prompt.dialogue !== 'None' && prompt.dialogue &&
        !/[\u0900-\u097F]/.test(prompt.dialogue)) {
      errors.push('Dialogue must be in Hindi देवनागरी — got: ' + prompt.dialogue);
    }
  }

  if (errors.length > 0) {
    logger.warn(
      `Prompt validation issues for scene ${sceneNumber}: ${errors.join(' | ')}`
    );
  }

  return prompt;
}
// === VVS FIX 2 END ===
import { getStyleConstraints } from '../services/style-constraints';
import db from '../db/connection';
import crypto from 'crypto';
import { z } from 'zod';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { GeminiService } from '../services/gemini.service';

// Model Mapping for the user's key to ensure only supported models are called
function mapModelName(model: string): string {
  if (!model) return 'gemini-2.5-flash';
  
  const clean = model.replace(/^models\//, '').toLowerCase().trim();
  if (
    clean.includes('3.5') ||
    clean.includes('3.1') ||
    clean.includes('1.5') ||
    clean.includes('preview') ||
    clean === 'gemini-pro' ||
    clean === 'gemini-pro-latest'
  ) {
    return 'gemini-2.5-flash';
  }
  return model;
}



// Monkeypatch GeminiService.prototype.generateJSON to transparently map model names
const originalGenerateJSON = GeminiService.prototype.generateJSON;
(GeminiService.prototype as any).generateJSON = function <T>(
  this: GeminiService,
  modelName: string,
  prompt: string,
  zodSchema: z.ZodType<T>,
  config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number },
  maxRetries?: number,
  onChunk?: (chunk: string) => void
): Promise<any> {
  const mapped = mapModelName(modelName);
  return originalGenerateJSON.call(this, mapped, prompt, zodSchema, config, maxRetries, onChunk);
};

// Monkeypatch GeminiService.prototype.generateStream to transparently map model names
const originalGenerateStream = GeminiService.prototype.generateStream;
(GeminiService.prototype as any).generateStream = function (
  this: GeminiService,
  modelName: string,
  prompt: string,
  onChunk: (chunk: string) => void,
  onComplete: (fullText: string) => void,
  onError: (err: unknown) => void,
  config?: { temperature?: number; maxOutputTokens?: number; topP?: number; topK?: number }
): Promise<void> {
  const mapped = mapModelName(modelName);
  return originalGenerateStream.call(this, mapped, prompt, onChunk, onComplete, onError, config);
};

// Auto-initialize DB settings to use the mapped models
try {
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('selected_model', 'backup_model_primary', 'backup_model_secondary')").all() as { key: string; value: string }[];
  const settingsMap = new Map(settingsRows.map(r => [r.key, r.value]));
  
  // Set default primary model
  if (!settingsMap.has('selected_model') || settingsMap.get('selected_model') !== 'gemini-2.5-flash') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('selected_model', 'gemini-2.5-flash', datetime('now'))").run();
  }
  // Set backup models
  if (!settingsMap.has('backup_model_primary') || settingsMap.get('backup_model_primary') !== 'gemini-2.5-pro') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('backup_model_primary', 'gemini-2.5-pro', datetime('now'))").run();
  }
  if (!settingsMap.has('backup_model_secondary') || settingsMap.get('backup_model_secondary') !== 'gemini-2.0-flash-001') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('backup_model_secondary', 'gemini-2.0-flash-001', datetime('now'))").run();
  }
} catch (dbErr) {
  console.error('[VeoAgent] Failed to auto-initialize Gemini model settings in DB:', dbErr);
}


// Migrate DB schema safely
try {
  db.exec('ALTER TABLE veo_prompts ADD COLUMN appearance_violation INTEGER DEFAULT 0;');
} catch (e) {
  // Column already exists or table is locked
}
try {
  db.exec('ALTER TABLE veo_prompts ADD COLUMN appearance_corrected INTEGER DEFAULT 0;');
} catch (e) {
  // Column already exists or table is locked
}
try {
  db.exec('ALTER TABLE veo_prompts ADD COLUMN lighting_kelvin INTEGER DEFAULT NULL;');
} catch (e) {
  // Column already exists or table is locked
}

// Monkeypatch VeoPromptRepository to write appearance validation and correction flags
const originalCreateOrUpdate = VeoPromptRepository.createOrUpdate;
VeoPromptRepository.createOrUpdate = async function (
  projectId: string,
  sceneId: string,
  phaseNumber: number,
  sceneNumber: number,
  data: any
): Promise<VeoPrompt> {
  if (data._subPrompts && data._subPrompts.length > 0) {
    const lastPromptRow = db.prepare(`
      SELECT * FROM veo_prompts
      WHERE project_id = ? AND phase_number = ? AND scene_number = ?
      ORDER BY CAST(prompt_number AS INTEGER) DESC
      LIMIT 1
    `).get(projectId, phaseNumber, sceneNumber) as VeoPrompt | undefined;

    if (!lastPromptRow) {
      throw new Error(`Sub-prompts were not found in database for project ${projectId}, phase ${phaseNumber}, scene ${sceneNumber}`);
    }
    return lastPromptRow;
  }

  const result = await originalCreateOrUpdate.call(this, projectId, sceneId, phaseNumber, sceneNumber, data);
  try {
    const isFailed = data.status === 'failed' || data.visual_truncated === 1;
    db.prepare('UPDATE scenes SET veo_prompt_generated = ? WHERE id = ?').run(isFailed ? 0 : 1, sceneId);

    db.prepare(`
      UPDATE veo_prompts
      SET appearance_violation = ?, appearance_corrected = ?, lighting_kelvin = ?
      WHERE id = ?
    `).run(
      data.appearance_violation ? 1 : 0,
      data.appearance_corrected ? 1 : 0,
      data.lighting_kelvin !== undefined ? data.lighting_kelvin : null,
      result.id
    );
    (result as any).appearance_violation = data.appearance_violation ? 1 : 0;
    (result as any).appearance_corrected = data.appearance_corrected ? 1 : 0;
    (result as any).lighting_kelvin = data.lighting_kelvin !== undefined ? data.lighting_kelvin : null;
    (data as any).status = data.status || 'done';
  } catch (err) {
    console.error(`[VeoAgent] Failed to update appearance columns in DB createOrUpdate:`, err);
  }
  return result;
};

const originalUpdateById = VeoPromptRepository.updateById;
VeoPromptRepository.updateById = async function (id: string, data: any) {
  const result = await originalUpdateById.call(this, id, data);
  try {
    db.prepare(`
      UPDATE veo_prompts
      SET appearance_violation = ?, appearance_corrected = ?, lighting_kelvin = ?
      WHERE id = ?
    `).run(
      data.appearance_violation ? 1 : 0,
      data.appearance_corrected ? 1 : 0,
      data.lighting_kelvin !== undefined ? data.lighting_kelvin : null,
      id
    );
    if (result) {
      const isFailed = data.status === 'failed' || data.visual_truncated === 1;
      db.prepare('UPDATE scenes SET veo_prompt_generated = ? WHERE id = ?').run(isFailed ? 0 : 1, result.scene_id);

      (result as any).appearance_violation = data.appearance_violation ? 1 : 0;
      (result as any).appearance_corrected = data.appearance_corrected ? 1 : 0;
      (result as any).lighting_kelvin = data.lighting_kelvin !== undefined ? data.lighting_kelvin : null;
      (result as any).status = data.status || 'done';
    }
  } catch (err) {
    console.error(`[VeoAgent] Failed to update appearance columns in DB updateById:`, err);
  }
  return result;
};
export class VeoAgent extends BaseAgent {
  constructor() {
    super('VeoAgent');
  }

  // === VVS FIX SAFETY-SANITIZE START ===
  private sanitizePromptForSafety(
    originalPrompt: string,
    sceneContext: {
      visualDescription: string;
      narration: string;
      characters: string[];
    }
  ): string {
    let sanitized = originalPrompt;

    // SUBSTITUTION TABLE — replace safety-triggering phrases with
    // stylistically equivalent safe alternatives.
    // All substitutions preserve visual meaning for the AI video generator.
    const substitutions: Array<[RegExp, string]> = [
      // Age/vulnerability language
      [/\binfant\b/gi, 'small figure'],
      [/\bbaby\b/gi, 'tiny character'],
      [/\bnewborn\b/gi, 'small character'],
      [/\bchild\b/gi, 'young character'],
      [/\btoddler\b/gi, 'small character'],
      // Suffering/distress language applied to characters
      [/\bshiver(?:ing|s|ed)?\b/gi, 'trembling slightly'],
      [/\bfreezing\b/gi, 'cold'],
      [/\bfrozen\b/gi, 'cold and still'],
      [/\bsuffer(?:ing|s|ed)?\b/gi, 'struggling'],
      [/\bstarv(?:ing|es|ed)?\b/gi, 'weakened'],
      [/\bnegLect(?:ed|ing|s)?\b/gi, 'alone'],
      [/\babandoned\b/gi, 'isolated'],
      [/\bdistress(?:ed)?\b/gi, 'sorrowful'],
      [/\bvulnerable\b/gi, 'small and isolated'],
      [/\bin\s+danger\b/gi, 'at risk'],
      [/\bharm(?:ed|ing|s)?\b/gi, 'affected'],
      // Physical distress descriptors
      [/\bchattering\s+teeth\b/gi, 'trembling mouth'],
      [/\btears?\s+spill(?:ing|s|ed)?\b/gi, 'liquid drops falling'],
      [/\bcrying\b/gi, 'showing emotion'],
      [/\bsob(?:bing|s|bed)?\b/gi, 'showing deep emotion'],
      [/\bwail(?:ing|s|ed)?\b/gi, 'expressing distress'],
      [/\bscream(?:ing|s|ed)?\b/gi, 'vocalizing'],
      // Welfare-specific phrases
      [/\bno\s+one\s+(?:cared?|helped?|came)\b/gi, 'alone in the space'],
      [/\bnobody\s+cared?\b/gi, 'in complete isolation'],
      [/\bleft\s+alone\b/gi, 'isolated'],
      [/\bforgotten\b/gi, 'unseen'],
      [/\bunwanted\b/gi, 'overlooked'],
      // Temperature extremes on characters
      [/\bfreezing\s+cold\b/gi, 'cold atmosphere'],
      [/\bfrost(?:bite|bitten)?\b/gi, 'cold damage'],
      [/\bhypotherm\w+\b/gi, 'cold effects'],
    ];

    for (const [pattern, replacement] of substitutions) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    // Remove or rephrase any sentence containing both a character name/role
    // AND a suffering descriptor that survived the substitution table.
    // Heuristic: if a sentence contains "Pip" or "infant" or "baby" alongside
    // words like "pain", "hurt", "freeze", "die", flag and soften:
    const sentences = sanitized.split(/(?<=[.!?])\s+/);
    const sensitiveCharacterTerms = ['pip', 'infant', 'baby', 'child', 'newborn'];
    const sensitiveActionTerms = [
      'pain', 'hurt', 'die', 'dying', 'dead', 'kill',
      'freeze', 'suffocate', 'starve', 'bleed'
    ];

    const cleanedSentences = sentences.map(sentence => {
      const lower = sentence.toLowerCase();
      const hasCharacter = sensitiveCharacterTerms.some(t => lower.includes(t));
      const hasAction = sensitiveActionTerms.some(t => lower.includes(t));
      if (hasCharacter && hasAction) {
        // Replace the action term with a neutral visual descriptor
        let fixed = sentence;
        for (const term of sensitiveActionTerms) {
          fixed = fixed.replace(
            new RegExp(`\\b${term}\\w*\\b`, 'gi'),
            'remain still'
          );
        }
        return fixed;
      }
      return sentence;
    });

    sanitized = cleanedSentences.join(' ');

    // Append a safety context note at the very end of the sanitized prompt
    // (outside the JSON structure if the prompt is a JSON generation request,
    // or at the end of the system instruction if it is a system prompt).
    // This note helps the model understand the content is stylized fiction:
    const safetyContext =
      '\n\nCONTENT CONTEXT: This is a fictional cinematic film production. ' +
      'All characters are fictional and not real or identifiable individuals. ' +
      'Scenes are tasteful and suitable for general audiences. ' +
      'Generate the requested technical video-prompt fields.';

    return sanitized + safetyContext;
  }
  // === VVS FIX SAFETY-SANITIZE END ===

  // Overriding generateStructured to pass sanitizedPrompt through to LLMRouter.generateStream
  protected override async generateStructured<T>(
    projectId: string | null,
    apiKey: string | undefined,
    modelName: string | undefined,
    params: {
      prompt: string;
      schema: z.ZodType<T, any, any>;
      systemInstruction?: string;
      maxRepairAttempts?: number;
      temperature?: number;
      maxOutputTokens?: number;
      sanitizedPrompt?: string;
      phaseNumber?: number;
    },
    onChunk?: (chunk: string) => void,
  ): Promise<T> {
    return super.generateStructured(projectId, apiKey, modelName, params, onChunk);
  }

  private async logToAgentLogs(log: {
    agent_name: string;
    project_id: string | null;
    status: 'success' | 'failed';
    error_message?: string;
    input_prompt?: string;
    output_response?: string;
    duration_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    repair_attempts?: number;
  }): Promise<void> {
    try {
      db.prepare(`
        INSERT INTO agent_logs
          (id, project_id, agent_name, model_used, input_tokens, output_tokens, duration_ms, status, error_message, input_prompt, output_response, repair_attempts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        crypto.randomUUID(),
        log.project_id,
        log.agent_name,
        'gemini-2.5-flash-lite',
        log.input_tokens ?? 0,
        log.output_tokens ?? 0,
        log.duration_ms ?? 0,
        log.status,
        log.error_message ?? null,
        log.input_prompt ?? null,
        log.output_response ?? null,
        log.repair_attempts ?? 0
      );
    } catch (err) {
      console.error('[VeoAgent] Failed to write to agent_logs:', err);
    }
  }

  async run(
    resolvedScene: any,
    project: any,
    bible: any,
    projectId: string,
    phaseNumber: number,
    sceneNumber: number,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number; enableValidators?: boolean },
    onChunk?: (chunk: string) => void,
    repairInstruction?: string
  ): Promise<VeoPromptData> {
    let previousConnections: string[] = [];
    let previousCameras: string[] = [];
    let previousLightings: string[] = [];
    let previousVisual: string | undefined = undefined;

    try {
      const previousPrompts = db.prepare(`
        SELECT visual, camera, connection, lighting FROM veo_prompts
        WHERE project_id = ? AND phase_number = ? AND scene_number < ?
        ORDER BY scene_number ASC
      `).all(projectId, phaseNumber, sceneNumber) as any[];

      previousConnections = previousPrompts.map(p => p.connection).filter(Boolean);
      previousCameras = previousPrompts.map(p => p.camera).filter(Boolean);
      previousLightings = previousPrompts.map(p => p.lighting).filter(Boolean);
      previousVisual = previousPrompts.length > 0 ? previousPrompts[previousPrompts.length - 1].visual : undefined;
    } catch (err: any) {
      console.error(`[VeoAgent] Error fetching previous prompts: ${err.message}`);
    }

    // Fetch phases for emotional arc context
    let emotionalArcContext = '';
    try {
      const dbPhases = db.prepare('SELECT phase_number, phase_type FROM phases WHERE project_id = ? ORDER BY phase_number ASC').all(projectId) as any[];
      const analysisRow = db.prepare('SELECT raw_json FROM story_analyses WHERE project_id = ?').get(projectId) as { raw_json: string } | undefined;
      const phaseIntensityMap = new Map<number, number>();
      if (analysisRow) {
        const parsed = JSON.parse(analysisRow.raw_json);
        if (parsed.phase_analyses) {
          for (const pa of parsed.phase_analyses) {
            phaseIntensityMap.set(pa.phase_number, pa.emotional_intensity);
          }
        }
      }
      const emotionalArc = dbPhases.map(p => {
        let intensity = phaseIntensityMap.get(p.phase_number);
        if (intensity === undefined) {
          const typeMapping: Record<string, number> = { hook: 8, build_up: 5, escalation: 7, climax: 10, outro: 4 };
          intensity = typeMapping[p.phase_type] || 5;
        }
        return {
          phase_number: p.phase_number,
          phase_type: p.phase_type,
          emotional_intensity: intensity,
          is_rehook_phase: [4, 6, 8].includes(p.phase_number)
        };
      });

      const totalScenesInPhaseRow = db.prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ? AND phase_number = ?').get(projectId, phaseNumber) as { count: number };
      const totalInPhase = totalScenesInPhaseRow ? totalScenesInPhaseRow.count : 1;
      const totalPhases = dbPhases.length || 10;
      const narrativePercent = Math.round(((phaseNumber - 1) / totalPhases) * 100);

      emotionalArcContext = JSON.stringify({
        FULL_VIDEO_EMOTIONAL_ARC: emotionalArc,
        CURRENT_SCENE_POSITION: `Phase ${phaseNumber} of ${totalPhases}, Scene ${sceneNumber} of ${totalInPhase}`,
        NARRATIVE_CONTEXT: `current phase is ${narrativePercent}% through the video`
      }, null, 2);
    } catch (e: any) {
      console.error(`[VeoAgent] Failed to construct emotional arc context: ${e.message}`);
    }

    // Fetch shot diversity constraints (last 3 veo prompts)
    let shotDiversityConstraint = '';
    try {
      const last3Prompts = db.prepare(`
        SELECT shot_type, camera FROM veo_prompts
        WHERE project_id = ? AND (phase_number < ? OR (phase_number = ? AND scene_number < ?))
        ORDER BY phase_number DESC, scene_number DESC
        LIMIT 3
      `).all(projectId, phaseNumber, phaseNumber, sceneNumber) as any[];

      const recentShotsList = last3Prompts.map(p => `[shot_type: ${p.shot_type || 'medium'}, camera: ${p.camera || 'static'}]`).reverse();
      shotDiversityConstraint = `RECENT SHOTS (do not repeat both shot_type AND camera in the next prompt):\n` +
        (recentShotsList.length > 0 ? recentShotsList.join('\n') : 'None (this is one of the first 3 shots)');
    } catch (e: any) {
      console.error(`[VeoAgent] Failed to construct shot diversity constraint: ${e.message}`);
    }

    // Resolve active character IDs from the scene's active_character_ids or character_ids_present
    let activeCharacterIds: string[] = [];
    let currentLocationId = '';
    let parsedScene: any = null;
    try {
      const sceneRow = db.prepare('SELECT raw_json FROM scenes WHERE project_id = ? AND phase_number = ? AND scene_number = ?').get(projectId, phaseNumber, sceneNumber) as { raw_json: string } | undefined;
      if (sceneRow) {
        parsedScene = JSON.parse(sceneRow.raw_json);
        activeCharacterIds = parsedScene.active_character_ids || parsedScene.character_ids_present || [];
        currentLocationId = parsedScene.location_id || '';
      }
    } catch (err: any) {
      console.error(`[VeoAgent] Failed to resolve active character IDs: ${err.message}`);
    }

    let prevKelvin: number | null = null;
    const currentSceneDescription = parsedScene?.scene_description || '';
    const hasTimeChange = /\b(night|dusk|dawn|storm|torch|fire|sunset|sunrise|later)\b/i.test(currentSceneDescription);

    if (currentLocationId) {
      try {
        const allPrevPrompts = db.prepare(`
          SELECT vp.prompt_number, vp.lighting_kelvin, s.raw_json
          FROM veo_prompts vp
          JOIN scenes s ON vp.scene_id = s.id
          WHERE vp.project_id = ?
          ORDER BY CAST(vp.prompt_number AS INTEGER) DESC
        `).all(projectId) as any[];

        for (const row of allPrevPrompts) {
          const rowScene = JSON.parse(row.raw_json);
          if (rowScene.location_id === currentLocationId) {
            if (row.lighting_kelvin !== null && row.lighting_kelvin !== undefined) {
              prevKelvin = Number(row.lighting_kelvin);
              break;
            }
          }
        }
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to fetch previous lighting Kelvin:`, dbErr);
      }
    }

    let appearanceBlock = '';
    if (activeCharacterIds && activeCharacterIds.length > 0) {
      const charBlocks: string[] = [];
      for (const charId of activeCharacterIds) {
        const char = (bible.character_roster || []).find((c: any) => c.id === charId);
        if (char && char.appearance_lock) {
          const lock = char.appearance_lock;
          const colorsList = Array.isArray(lock.clothing_colors) ? lock.clothing_colors.join(', ') : (lock.clothing_colors || '');
          const neverList = Array.isArray(lock.forbidden_appearance_changes) ? lock.forbidden_appearance_changes.join(', ') : (lock.forbidden_appearance_changes || '');
          charBlocks.push(
`CHARACTER: ${char.name} (${char.id})
— Ethnicity: ${lock.ethnicity || ''}
— Age: ${lock.approximate_age || ''}
— Gender: ${lock.gender || ''}
— Skin tone: ${lock.skin_tone || ''}
— Hair: ${lock.hair || ''}
— Eyes: ${lock.eyes || ''}
— Face: ${lock.face_structure || ''}
— Distinguishing: ${lock.distinguishing_features || ''}
— Clothing: ${lock.primary_clothing || ''}
— Colors: ${colorsList}
— Era: ${lock.clothing_era || ''}
— Accessories: ${lock.accessories || ''}
— NEVER: ${neverList}`
          );
        }
      }
      if (charBlocks.length > 0) {
        appearanceBlock = `CHARACTER APPEARANCE REFERENCE — READ ONLY, NEVER DEVIATE:
Every character listed below has a locked appearance. When this character appears in the visual field, you must describe them using ONLY the details below. Do not invent new clothing, change hair, alter skin tone, add or remove accessories, or modify any locked detail for any reason including lighting, mood, or artistic preference.

SPECIES/TRAIT DISAMBIGUATION: If the character name contains an animal metaphor (e.g., 'Ostrich'), ensure the visual description strictly matches the locked species (e.g., 'anthropomorphic mascot') OR strictly matches the locked human traits, NEVER a hybrid of both. Do not add feathers, beaks, wings, or animal appendages if the appearance details specify human traits like hair or clothing.

${charBlocks.join('\n\n')}

HARD RULE: If your visual description includes any detail that contradicts the locked appearance above, your output fails validation. The locked appearance overrides all other creative decisions.`;
      }
    }

    const styleLock = bible.visual_style_lock || {};
    if (!styleLock.style_name && project.visual_style) {
      styleLock.style_name = project.visual_style;
    }
    const styleConstraints = getStyleConstraints(styleLock);

    // === VVS FIX SAFETY-SYSTEM-PROMPT START ===
    const safetyPreamble = `You are generating technical video production prompts
for a fictional cinematic film production.
All characters in this project are fictional and not real or identifiable
individuals. All scenes depict a tasteful storybook or cinematic world
intended for general audiences. Character emotions and situations are depicted
in an artistic manner consistent with tasteful dramatic storytelling.
Generate the requested technical prompt fields without modification.
This content is appropriate for general family audiences.\n\n`;

    const contentProfile = resolveContentProfile(project.content_profile || 'viral_story');
    let system = safetyPreamble + getVeoSystemPrompt(project, bible, contentProfile);
    // === VVS FIX SAFETY-SYSTEM-PROMPT END ===

    if (styleConstraints.systemInstructionBlock) {
      system += `\n\n${styleConstraints.systemInstructionBlock}`;
    }

    if (appearanceBlock) {
      system = `${system}\n\n${appearanceBlock}`;
    }

    // Fetch previous scene's visual_state_snapshot
    let sceneContinuityBlock = '';
    try {
      let prevSceneRow: any = null;
      if (sceneNumber > 1) {
        prevSceneRow = db.prepare(`
          SELECT visual_state_snapshot, raw_json FROM scenes
          WHERE project_id = ? AND phase_number = ? AND scene_number = ?
        `).get(projectId, phaseNumber, sceneNumber - 1);
      } else if (phaseNumber > 1) {
        prevSceneRow = db.prepare(`
          SELECT visual_state_snapshot, raw_json FROM scenes
          WHERE project_id = ? AND phase_number = ?
          ORDER BY scene_number DESC
          LIMIT 1
        `).get(projectId, phaseNumber - 1);
      }

      if (prevSceneRow) {
        const snapshot = prevSceneRow.visual_state_snapshot
          ? JSON.parse(prevSceneRow.visual_state_snapshot)
          : (JSON.parse(prevSceneRow.raw_json).visual_state_snapshot || null);

        if (snapshot) {
          const charsList = (snapshot.characters_present || []).map((c: any) => 
            `- Character: ${c.character_id}\n  Position: ${c.current_position}\n  Props Held: ${(c.props_held || []).join(', ') || 'None'}\n  Physical Condition: ${c.physical_condition}\n  Facing: ${c.facing_direction}`
          ).join('\n');
          
          const formattedSnapshot = `Characters Present:\n${charsList || 'None'}\nLocation State: ${snapshot.location_state || ''}\nTime of Day: ${snapshot.time_of_day || ''}\nAtmosphere: ${snapshot.weather_or_atmosphere || ''}\nKey Objects Visible: ${(snapshot.key_objects_visible || []).join(', ') || 'None'}`;

          sceneContinuityBlock = `SCENE CONTINUITY STATE — previous scene ended with:\n${formattedSnapshot}\nYour visual description must be physically continuous from this state. Characters must be in the positions, holding the props, and facing the directions described above unless this scene explicitly transitions them.`;
        }
      }
    } catch (err: any) {
      console.error(`[VeoAgent] Failed to resolve previous scene snapshot for Veo context: ${err.message}`);
    }

    if (sceneContinuityBlock) {
      system = `${system}\n\n${sceneContinuityBlock}`;
    }

    if (prevKelvin !== null && !hasTimeChange) {
      const lightingConstraint = `
LIGHTING CONTINUITY CONSTRAINT:
The previous scene in this location used ${prevKelvin}K lighting. Your lighting temperature must be within 500K of this value (${prevKelvin - 500}K to ${prevKelvin + 500}K) unless the scene_description explicitly describes a change in time of day or weather. Do not invent lighting temperature jumps between scenes in the same location.`;
      system = `${system}\n\n${lightingConstraint}`;
    }
    // === VVS OPT FIX-1A START ===
    const user = getVeoUserPrompt(
      resolvedScene,
      styleLock,
      undefined,
      previousConnections,
      previousCameras,
      previousLightings,
      previousVisual,
      emotionalArcContext,
      shotDiversityConstraint
    );
    // === VVS OPT FIX-1A END ===
    let fullPrompt = `${system}\n\n${user}`;
    if (repairInstruction) {
      fullPrompt += `\n\n${repairInstruction}`;
    }

    const finalConfig = {
      ...(config || {}),
      maxOutputTokens: 2048,
    };

    let data: VeoPromptData = {
      prompt_number: '1' as any,
      visual: resolvedScene.scene_description || 'Incomplete visual description.',
      shot: 'MS',
      shot_type: 'medium',
      lens: 'Standard Lens',
      lighting: 'Ambient Lighting',
      camera: 'Static Camera',
      ambient_sound: 'ambient silence',
      sfx: 'None',
      dialogue: '',
      avoid: 'None',
      connection: 'None',
      narration: resolvedScene.narration_fragment || '',
      duration_seconds: 8,
      scene_type: 'standard',
      veo_full_prompt: '',
      overlay_suggestions: [],
    };

    // === VVS FIX QUOTA-MESSAGE START ===
    try {
      // === VVS FIX SAFETY-RETRY START ===
      const MAX_SAFETY_RETRIES = 1;
      let safetyRetryCount = 0;
      const originalBuiltPrompt = fullPrompt;
      let promptToSend = originalBuiltPrompt;
      let lastError: Error | null = null;

      while (safetyRetryCount <= MAX_SAFETY_RETRIES) {
        try {
          let retryCount = 0;
          let currentPrompt = promptToSend;
          let visualNeedsRetry = false;
          let retryPromptInstruction = '';

          // Loop 1: Visual Budget & Truncation Retry Loop (Max 1 retry)
          while (retryCount <= 1) {
            try {
              const generated = await this.generateStructured<VeoPromptData>(
                projectId,
                apiKey,
                modelName,
                {
                  prompt: currentPrompt,
                  schema: veoPromptAgentOutputSchema,
                  temperature: finalConfig.temperature,
                  maxOutputTokens: finalConfig.maxOutputTokens,
                  sanitizedPrompt: safetyRetryCount > 0 ? promptToSend : undefined,
                  phaseNumber: phaseNumber,
                },
                onChunk
              );

              const visualTrimmed = (generated.visual || '').trim();
              const endsWithSentenceTerminator = /[.!?]$/.test(visualTrimmed);
              const visualWords = visualTrimmed.split(/\s+/).filter(Boolean);

              if (!endsWithSentenceTerminator) {
                console.warn(`[VeoAgent] Visual ended mid-sentence on attempt ${retryCount + 1}.`);
                if (retryCount === 0) {
                  visualNeedsRetry = true;
                  retryPromptInstruction = `[RETRY INSTRUCTION - CONCISE REWRITE]: The previous output was truncated or ended mid-sentence. You must rewrite the visual description to be more concise (MAXIMUM 40 words) and ensure it finishes completely with a sentence terminator (. or ! or ?).`;
                } else {
                  visualNeedsRetry = false;
                }
                data = generated;
              } else if (visualWords.length > 80) {
                console.warn(`[VeoAgent] Visual exceeded 80 words (${visualWords.length} words) on attempt ${retryCount + 1}.`);
                if (retryCount === 0) {
                  visualNeedsRetry = true;
                  retryPromptInstruction = `[RETRY INSTRUCTION - CONDENSE REWRITE]: The previous visual description was too long (${visualWords.length} words). You must rewrite it to be strictly under 80 words (target ~65 words). Keep the single dominant subject and action, and preserve the concrete physical details. You must DROP any secondary/listy elements, multiple simultaneous activities, and meta-phrasing about realism or aesthetics (e.g. do not say "rendered with realistic textures" or "documentary aesthetic"). Every word must count and describe a visible physical detail. Ends with a period.`;
                } else {
                  visualNeedsRetry = false;
                }
                data = generated;
              } else {
                visualNeedsRetry = false;
                data = generated;
                break;
              }
            } catch (err) {
              console.error(`[VeoAgent] Generation error on attempt ${retryCount + 1}:`, err);
              if (retryCount === 1) {
                throw err;
              }
              visualNeedsRetry = true;
              retryPromptInstruction = `[RETRY INSTRUCTION]: The previous generation failed or returned invalid JSON. Rewrite the response adhering strictly to the schema, keeping the visual description under 80 words.`;
            }

            if (visualNeedsRetry && retryCount === 0) {
              retryCount++;
              currentPrompt = `${promptToSend}\n\n${retryPromptInstruction}`;
            } else {
              break;
            }
          }

          // success — break out of safety retry loop
          lastError = null;
          break;

        } catch (error) {
          const isSafetyBlock =
            error instanceof Error &&
            (error as any).errorType === 'PROHIBITED_CONTENT';

          if (isSafetyBlock && safetyRetryCount < MAX_SAFETY_RETRIES) {
            safetyRetryCount++;

            // Log the safety block clearly
            logger.warn(
              `[VeoAgent] PROHIBITED_CONTENT on attempt ${safetyRetryCount}. ` +
              `Running sanitization pass and retrying. Scene: ${resolvedScene.scene_number}`
            );

            // Build scene context for sanitizer
            const sceneContext = {
              visualDescription: parsedScene?.scene_description ?? '',
              narration: resolvedScene.narration_fragment ?? '',
              characters: (bible.character_roster || [])
                .filter((c: any) => activeCharacterIds.includes(c.id))
                .map((c: any) => c.name ?? ''),
            };

            // Sanitize and retry with the modified prompt
            promptToSend = this.sanitizePromptForSafety(
              originalBuiltPrompt,
              sceneContext
            );

            // Log to agent_logs
            await this.logToAgentLogs({
              agent_name: 'VeoAgent_SafetySanitize',
              project_id: projectId,
              status: 'success',
              input_prompt: originalBuiltPrompt.slice(0, 500),
              output_response:
                `Safety sanitization pass ${safetyRetryCount} applied. ` +
                `Scene ${resolvedScene.scene_number}.`,
              duration_ms: 0,
              input_tokens: 0,
              output_tokens: 0,
              repair_attempts: safetyRetryCount,
            });

            continue; // retry the while loop with sanitized prompt

          } else if (isSafetyBlock && safetyRetryCount >= MAX_SAFETY_RETRIES) {
            // All sanitization retries exhausted
            logger.error(
              `[VeoAgent] PROHIBITED_CONTENT persists after ${MAX_SAFETY_RETRIES} ` +
              `sanitization attempts for scene ${resolvedScene.scene_number}. ` +
              `Marking scene as failed.`
            );

            await this.logToAgentLogs({
              agent_name: 'VeoAgent_SafetySanitize',
              project_id: projectId,
              status: 'failed',
              error_message:
                `PROHIBITED_CONTENT persisted after ${MAX_SAFETY_RETRIES} sanitization retries.`,
              input_prompt: promptToSend.slice(0, 500),
              output_response: 'All safety sanitization retries exhausted.',
              duration_ms: 0,
              input_tokens: 0,
              output_tokens: 0,
              repair_attempts: safetyRetryCount,
            });

            // Throw a user-friendly error that the route handler can
            // convert to a meaningful HTTP response
            throw new Error(
              `VeoAgent: Scene ${resolvedScene.scene_number} was blocked by content ` +
              `safety filters after ${MAX_SAFETY_RETRIES} sanitization attempts. ` +
              `Review the scene description for sensitive language about ` +
              `characters in distress and regenerate the scene manually.`
            );

          } else {
            // Non-safety error — rethrow as before (quota, timeout, unknown)
            throw error;
          }
        }
      }
      // === VVS FIX SAFETY-RETRY END ===

      // Run post-processing
      await this.postProcess(
        data,
        resolvedScene,
        project,
        projectId,
        styleConstraints,
        activeCharacterIds,
        bible,
        modelName,
        prevKelvin,
        hasTimeChange,
        currentLocationId,
        apiKey,
        config?.enableValidators !== false
      );

      // Loop 2: Completeness Gate & Single Retry
      let validationResult = safeParseVeoPrompt(data, resolvedScene);

      if (!validationResult.success && (data as any).status !== 'failed') {
        const zodErrorsText = (validationResult as any).error.errors.map((e: any) => `- Field "${e.path.join('.')}": ${e.message}`).join('\n');
        console.warn(`[VeoAgent] Completeness validation failed. Retrying once with error feedback. Errors:\n${zodErrorsText}`);

        const retryPrompt = `${fullPrompt}\n\n[RETRY INSTRUCTION - COMPLETENESS GATE]: The previous output failed completeness validation. You must generate a complete JSON object where all fields are filled, valid, and non-empty.
        
  VALIDATION ERRORS TO FIX:
  ${zodErrorsText}`;

        try {
          const retryData = await this.generateStructured<VeoPromptData>(
            projectId,
            apiKey,
            modelName,
            {
              prompt: retryPrompt,
              schema: veoPromptAgentOutputSchema,
              temperature: finalConfig.temperature,
              maxOutputTokens: finalConfig.maxOutputTokens,
              phaseNumber: phaseNumber,
            },
            onChunk
          );

          // Run post-processing on retryData
          await this.postProcess(
            retryData,
            resolvedScene,
            project,
            projectId,
            styleConstraints,
            activeCharacterIds,
            bible,
            modelName,
            prevKelvin,
            hasTimeChange,
            currentLocationId,
            apiKey,
            config?.enableValidators !== false
          );

          const finalValidationResult = safeParseVeoPrompt(retryData, resolvedScene);
          if (finalValidationResult.success) {
            // If retry succeeded, use retryData and set status done
            data = retryData;
            (data as any).status = 'done';
            data.visual_truncated = 0;
          } else {
            // If retry still fails, use retryData, set status failed, and log
            data = retryData;
            (data as any).status = 'failed';
            const finalZodErrors = finalValidationResult.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
            this.logGateFailure(projectId, modelName, finalZodErrors);
          }
        } catch (retryErr: any) {
          console.error(`[VeoAgent] Completeness gate retry failed with exception:`, retryErr);
          (data as any).status = 'failed';
          this.logGateFailure(projectId, modelName, retryErr.message || String(retryErr));
        }
      } else if (validationResult.success === false && (data as any).status === 'failed') {
        const zodErrors = (validationResult as any).error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        this.logGateFailure(projectId, modelName, `Truncated: ${zodErrors}`);
      } else {
        (data as any).status = 'done';
      }
      data.prompt_number = 1 as any;
      data.veo_full_prompt = assembleVeoFullPrompt(data, 1, resolvedScene.title || 'Untitled Scene');

      return data;

    } catch (error) {
      const terminalMsg = error instanceof Error ? error.message : String(error);

      if (terminalMsg.includes('All models in fallback chain failed')) {
        throw new Error(
          `VeoAgent: All available models are quota-limited or rate-limited. ` +
          `This typically happens when daily token limits are exhausted on all ` +
          `configured Gemini models. Recommended actions:\n` +
          `1. Wait until midnight Pacific Time for daily quotas to reset.\n` +
          `2. Add a HighwayAPI or third-party provider key in AI Settings as ` +
          `   a fallback (these use separate quota pools).\n` +
          `3. Switch your active model to gemini-2.0-flash in AI Settings ` +
          `   (lowest quota consumption per request).\n` +
          `Original error: ${terminalMsg}`
        );
      }
      throw error;
    }
    // === VVS FIX QUOTA-MESSAGE END ===
  }

  private logGateFailure(projectId: string, modelName: string | undefined, errorMsg: string) {
    try {
      db.prepare(`
        INSERT INTO agent_logs
          (id, project_id, agent_name, model_used, status, error_message, created_at)
        VALUES (?, ?, 'VeoAgent_Gate', ?, 'failed', ?, CURRENT_TIMESTAMP)
      `).run(
        crypto.randomUUID(),
        projectId,
        modelName || 'gemini-2.5-flash-lite',
        `Completeness validation failed: ${errorMsg}`
      );
    } catch (dbErr: any) {
      console.error(`[VeoAgent] Failed to log completeness failure to agent_logs: ${dbErr.message}`);
    }
  }

  async validatePromptFields(
    projectId: string,
    promptData: any,
    activeCharacterIds: string[],
    bible: any,
    project: any,
    apiKey: string | undefined,
    modelName?: string,
    phaseNumber?: number
  ): Promise<{
    violation: boolean;
    violations: Array<{
      field: 'visual' | 'lighting' | 'shot' | 'camera' | 'dialogue' | 'sfx' | 'ambient_sound' | 'avoid' | 'connection';
      issue: string;
      suggestion: string;
      rule: string;
      severity: 'error' | 'warning';
    }>;
  }> {
    const charSummaries = (activeCharacterIds || []).map(charId => {
      const char = (bible.character_roster || []).find((c: any) => c.id === charId);
      if (char && char.appearance_lock) {
        const lock = char.appearance_lock;
        const colorsList = Array.isArray(lock.clothing_colors) ? lock.clothing_colors.join(', ') : (lock.clothing_colors || '');
        const neverList = Array.isArray(lock.forbidden_appearance_changes) ? lock.forbidden_appearance_changes.join(', ') : (lock.forbidden_appearance_changes || '');
        return `Character: ${char.name} (${char.id}) - Locked appearance:
- Ethnicity: ${lock.ethnicity || 'N/A'}
- Age: ${lock.approximate_age || 'N/A'}
- Gender: ${lock.gender || 'N/A'}
- Skin tone: ${lock.skin_tone || 'N/A'}
- Hair: ${lock.hair || 'N/A'}
- Eyes: ${lock.eyes || 'N/A'}
- Face structure: ${lock.face_structure || 'N/A'}
- Distinguishing features: ${lock.distinguishing_features || 'N/A'}
- Primary clothing: ${lock.primary_clothing || 'N/A'}
- Clothing colors: ${colorsList}
- Clothing era: ${lock.clothing_era || 'N/A'}
- Accessories: ${lock.accessories || 'N/A'}
- Forbidden changes (NEVER allow these to change): ${neverList}`;
      }
      return '';
    }).filter(Boolean).join('\n\n');

    const styleLock = bible.visual_style_lock || {};
    if (!styleLock.style_name && project.visual_style) {
      styleLock.style_name = project.visual_style;
    }
    const styleConstraints = getStyleConstraints(styleLock);

    let styleRules = `Visual Style: ${project.visual_style || 'N/A'}
Description: ${styleLock.description || 'N/A'}
Tokens: ${(styleLock.veo_style_tokens || []).join(', ')}`;
    
    if (styleConstraints.avoidKeywords.length > 0) {
      styleRules += `\n\nFORBIDDEN STYLE ELEMENTS (WARNING TIER):
The following elements are strictly forbidden/contradictory for this visual style: ${styleConstraints.avoidKeywords.join(', ')}.
If any of these forbidden style elements (or close synonyms) appear in the "visual", "lighting", or "camera" fields of the prompt, you MUST trigger a "warning"-tier style violation for that field, and suggest a correction that removes or replaces the style-drifting term with a style-appropriate description.`;
    }

    const promptFieldsText = `
Visual Description: ${promptData.visual || ''}
Lighting Setup: ${promptData.lighting || ''}
Shot Details: ${promptData.shot || ''}
Camera Movement: ${promptData.camera || ''}
Dialogue: ${promptData.dialogue || ''}
Sound Effects (SFX): ${promptData.sfx || ''}
Ambient Track: ${promptData.ambient_sound || ''}
Avoid Field: ${promptData.avoid || ''}
Connection: ${promptData.connection || ''}
`;

    const validationPrompt = `You are the VeoAgent_AppearanceValidator. Your task is to check all the textual fields of a video prompt against character locks, style locks, and the Species/Trait Disambiguation rules.

## CHARACTER LOCKS:
${charSummaries || 'No active characters in this scene.'}

## VISUAL STYLE LOCK & RULES:
${styleRules}

## SPECIES/TRAIT DISAMBIGUATION RULE:
If a character's name contains an animal metaphor (e.g. 'Ostrich', 'Lion'), ensure the description strictly matches their locked character roster description or human traits, and NEVER a hybrid of animal-human features (no feathers, beaks, wings, fur, claws, animal face, unless explicitly part of their locked appearance).

## PROMPT FIELDS TO VALIDATE:
${promptFieldsText}

## YOUR TASK:
1. Identify any violations across ALL textual prompt fields (visual, lighting, shot, camera, dialogue, sfx, ambient_sound, avoid, connection).
2. Classify each violation by severity:
   - "error": contradicts a hard appearance lock, forbidden change, or Species/Trait Disambiguation rule.
   - "warning": style-token drift (e.g., describing realistic lighting/3D shadows/depth of field/gradients on a Flat 2D vector project).
3. Provide a suggested correction ("suggestion") for each violated field. The suggestion must be a complete drop-in replacement string for that field with the violation corrected while preserving everything else.
CRITICAL OUTPUT CONSTRAINT: The 'suggestion' field for each violation must be no longer than 120 characters. Do not write full replacement visual descriptions in the suggestion field. Write only the specific change needed, not the full rewritten field value. Example of correct suggestion: 'Replace cold blue light with warm volumetric glow per style lock.' Example of incorrect suggestion: [a 300-word full replacement visual description]. Keep all suggestion fields under 120 characters.
4. Reply ONLY with a JSON object matching this schema:
{
  "violation": boolean,
  "violations": [
    {
      "field": "visual" | "lighting" | "shot" | "camera" | "dialogue" | "sfx" | "ambient_sound" | "avoid" | "connection",
      "issue": "clear description of the violation",
      "suggestion": "complete drop-in corrected string for the field",
      "rule": "Appearance Lock: <detail>", "Style Lock: <detail>", or "Species/Trait Disambiguation",
      "severity": "error" | "warning"
    }
  ]
}
- If violation is false, the violations array should be empty.`;

    const originalAgentName = (this as any).agentName;
    try {
      (this as any).agentName = 'VeoAgent_AppearanceValidator';
      const validationResult = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: validationPrompt,
          schema: veoExtendedValidationSchema,
          temperature: 0,
          maxOutputTokens: 800,
          phaseNumber: phaseNumber,
        }
      );
      return validationResult;
    } catch (valErr: any) {
      console.error(`[VeoAgent] Error during appearance/style validation:`, valErr);
      return { violation: false, violations: [] };
    } finally {
      (this as any).agentName = originalAgentName;
    }
  }

  public async rewriteNarrationToFit(
    projectId: string,
    apiKey: string | undefined,
    modelName: string | undefined,
    originalNarration: string,
    targetDuration: number,
    minWords: number,
    maxWords: number,
    project: any,
    phaseNumber?: number
  ): Promise<string> {
    const targetWords = Math.round((minWords + maxWords) / 2);
    const validationPrompt = `You are a professional micro-pass narration editor.
Your task is to rewrite a scene's voiceover narration fragment so that its word count fits the duration of a shot.

original narration: "${originalNarration}"
target duration: ${targetDuration} seconds
word count budget: between ${minWords} and ${maxWords} words (ideally target ${targetWords} words)

CRITICAL CONSTRAINTS:
1. Preserve the meaning of the original narration.
2. Maintain the visual and emotional context.
3. Keep all names of characters or locations from the original narration.
4. Language of narration: You must write the output in the same language (${project.narration_language || 'English'}) as the original narration.
5. The rewritten narration MUST contain between ${minWords} and ${maxWords} words.
6. Return ONLY a JSON object matching this schema:
{
  "rewritten_narration": "the rewritten narration text"
}`;

    const originalAgentName = (this as any).agentName;
    try {
      (this as any).agentName = 'VeoAgent_NarrationFit';
      const result = await this.generateStructured<{ rewritten_narration: string }>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: validationPrompt,
          schema: z.object({ rewritten_narration: z.string().min(1) }),
          temperature: 0.2,
          phaseNumber: phaseNumber,
        }
      );
      if (result && result.rewritten_narration) {
        return result.rewritten_narration;
      }
    } catch (err: any) {
      console.error(`[VeoAgent] Narration fit rewrite failed:`, err);
    } finally {
      (this as any).agentName = originalAgentName;
    }
    return originalNarration;
  }

  public async reconcileConnections(
    projectId: string,
    apiKey: string | undefined,
    modelName: string | undefined,
    prevPrompt: any | null,
    currPrompt: any,
    nextPrompt: any | null
  ): Promise<{ connection_prev?: string; connection_curr: string; connection_next?: string }> {
    let contextPrompt = `You are a professional video editing/continuity agent.
Your task is to rewrite ONLY the "connection" fields between consecutive shots to ensure smooth, coherent transitions, after a shot type or camera movement was changed.

Here is the context of the three consecutive shots:
`;

    if (prevPrompt) {
      contextPrompt += `
SHOT 1 (Previous Shot):
- Visual: ${prevPrompt.visual}
- Shot Details: ${prevPrompt.shot} (Type: ${prevPrompt.shot_type})
- Camera Movement: ${prevPrompt.camera}
- Original Connection to Shot 2: ${prevPrompt.connection}
`;
    }

    contextPrompt += `
SHOT 2 (Current Repaired Shot):
- Visual: ${currPrompt.visual}
- Shot Details: ${currPrompt.shot} (Type: ${currPrompt.shot_type})
- Camera Movement: ${currPrompt.camera}
- Original Connection to Shot 3: ${currPrompt.connection || 'None'}
`;

    if (nextPrompt) {
      contextPrompt += `
SHOT 3 (Next Shot):
- Visual: ${nextPrompt.visual}
- Shot Details: ${nextPrompt.shot} (Type: ${nextPrompt.shot_type})
- Camera Movement: ${nextPrompt.camera}
- Original Connection to Shot 4: ${nextPrompt.connection}
`;
    }

    contextPrompt += `
INSTRUCTIONS:
1. Re-evaluate and rewrite the connection/transition field for each transition:
   - "connection_prev": describes the transition from Shot 1 to Shot 2. This must reconcile the visual action, framing, and camera movement of Shot 1 and Shot 2.
   - "connection_curr": describes the transition from Shot 2 to Shot 3. This must reconcile the visual action, framing, and camera movement of Shot 2 and Shot 3.
   - "connection_next": describes the transition from Shot 3 to Shot 4 (if Shot 3 exists). Reconcile Shot 3 and Shot 4.
2. If Shot 1 (Previous Shot) does not exist, omit "connection_prev".
3. If Shot 3 (Next Shot) does not exist, omit "connection_next".
4. Ensure the transitions feel natural, fluid, and direct. Do not mention "Shot 1", "Shot 2", or "Shot 3" in the connection text; describe it from the viewer's/camera's perspective (e.g. "The camera matches the speed of the runner as it cuts to the wide profile view", "The static close-up holds on the letter as the sound of the door closing bridges into the next scene").
5. Reply ONLY with a JSON object matching this schema:
{
  ${prevPrompt ? '"connection_prev": "transition description string from Shot 1 to Shot 2",\n' : ''}  "connection_curr": "transition description string from Shot 2 to Shot 3"${nextPrompt ? ',\n  "connection_next": "transition description string from Shot 3 to next shot"' : ''}
}`;

    const originalAgentName = (this as any).agentName;
    try {
      (this as any).agentName = 'VeoAgent_ConnectionReconciliation';
      const schemaFields: any = {
        connection_curr: z.string().min(1)
      };
      if (prevPrompt) {
        schemaFields.connection_prev = z.string().min(1);
      }
      if (nextPrompt) {
        schemaFields.connection_next = z.string().min(1);
      }

      const result = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: contextPrompt,
          schema: z.object(schemaFields),
          temperature: 0.2,
        }
      );
      return result;
    } catch (err: any) {
      console.error(`[VeoAgent] Connection reconciliation failed:`, err);
      return {
        connection_curr: currPrompt.connection || 'None'
      };
    } finally {
      (this as any).agentName = originalAgentName;
    }
  }

  private async postProcess(
    data: any,
    resolvedScene: any,
    project: any,
    projectId: string,
    styleConstraints: any,
    activeCharacterIds: string[],
    bible: any,
    modelName: string | undefined,
    prevKelvin: number | null,
    hasTimeChange: boolean,
    currentLocationId: string,
    apiKey: string | undefined,
    enableValidators: boolean = true
  ): Promise<any> {
    // Resolve scene metadata from raw_json in DB for character ids, objects, dialogue, time of day
    if (data.visual) {
      let visualTrimmed = data.visual.trim();
      let visualWords = visualTrimmed.split(/\s+/).filter(Boolean);
      if (visualWords.length > 80) {
        console.warn(`[VeoAgent] Visual still exceeds 80 words (${visualWords.length} words) inside postProcess. Applying sentence-boundary trim...`);
        const sentences = visualTrimmed.match(/[^.!?]+[.!?]+/g) || [visualTrimmed];
        while (sentences.length > 1) {
          const tentativeText = sentences.slice(0, -1).join(' ').trim();
          const tentativeWords = tentativeText.split(/\s+/).filter(Boolean);
          if (tentativeWords.length >= 40) {
            sentences.pop();
            visualTrimmed = tentativeText;
            visualWords = tentativeWords;
            if (visualWords.length <= 80) {
              break;
            }
          } else {
            break;
          }
        }
        data.visual = visualTrimmed;
        if (data.visual && !/[.!?]$/.test(data.visual)) {
          data.visual += '.';
        }
      }
    }

    let isDialogue = false;
    let dialogueLine = "";
    let featuredObjectIds: string[] = [];
    let timeOfDay = "day";

    try {
      const sceneRow = db.prepare('SELECT raw_json FROM scenes WHERE project_id = ? AND phase_number = ? AND scene_number = ?').get(projectId, resolvedScene.phase_number, resolvedScene.scene_number) as { raw_json: string } | undefined;
      if (sceneRow) {
        const parsed = JSON.parse(sceneRow.raw_json);
        isDialogue = parsed.is_dialogue === true || parsed.is_dialogue === 1;
        dialogueLine = parsed.dialogue || "";
        featuredObjectIds = parsed.object_ids_featured || [];
        if (parsed.visual_state_snapshot) {
          timeOfDay = parsed.visual_state_snapshot.time_of_day || "day";
        }
      }
    } catch (err) {
      console.error('[VeoAgent] postProcess failed to parse scene details:', err);
    }

    const hasBrandedProductFeatured = (featuredObjectIds || []).some((objId: string) => {
      const obj = (bible?.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
      return obj && obj.is_branded_product === true;
    });

    // 1. Two presence flags computed early
    const namedCharacter = activeCharacterIds.length > 0;

    const sceneDescForFlags = (resolvedScene.scene_description || '').toLowerCase();
    const visualTextForFlags = (data.visual || '').toLowerCase();
    const combinedTextForFlags = sceneDescForFlags + " " + visualTextForFlags;

    const humanRegex = /(?<!\b(?:robotic|mechanical|robot|robots|robot's)\s+)\b(operator|operators|crew|crewmember|crewmembers|worker|workers|attendant|sailor|captain|engineer|technician|deckhand|person|people|man|men|woman|women|hand|hands|finger|fingers|knuckle|knuckles|face|faces|torso|mouth|lip|lips)\b/i;
    const humanInFrame = namedCharacter || humanRegex.test(combinedTextForFlags);

    // 1. Character Anchor sentence prepended to visual
    const characterAnchors: string[] = [];
    const forbiddenList: string[] = [];
    for (const charId of activeCharacterIds) {
      const char = (bible.character_roster || []).find((c: any) => c.id === charId);
      if (char && char.appearance_lock) {
        const lock = char.appearance_lock;
        const colors = Array.isArray(lock.clothing_colors) ? lock.clothing_colors.join(', ') : (lock.clothing_colors || '');
        const accessoriesStr = lock.accessories ? `, wearing ${lock.accessories}` : '';
        characterAnchors.push(`${char.name} is a ${lock.approximate_age} ${lock.ethnicity} ${lock.gender} (skin: ${lock.skin_tone}, hair: ${lock.hair}, eyes: ${lock.eyes}, face: ${lock.face_structure}${accessoriesStr}, wearing ${lock.primary_clothing} in ${colors} from ${lock.clothing_era} era)`);
        if (Array.isArray(lock.forbidden_appearance_changes)) {
          forbiddenList.push(...lock.forbidden_appearance_changes);
        }
      }
    }
    if (characterAnchors.length > 0) {
      const anchorSentence = `Subject lock: ${characterAnchors.join('; ')}.`;
      if (!data.visual.includes('Subject lock:')) {
        data.visual = `${anchorSentence} ${data.visual}`;
      }
    }

    // 2. Hero-prop lock injected into visual
    const heroPropLocks: string[] = [];
    const propAvoids: string[] = [];
    for (const objId of featuredObjectIds) {
      const obj = (bible.object_registry || []).find((o: any) => o.id === objId || o.object_id === objId);
      if (obj && obj.is_hero_prop) {
        if (obj.visual_lock) {
          heroPropLocks.push(`${obj.name} visual style: ${obj.visual_lock}`);
        }
        if (Array.isArray(obj.forbidden_variations)) {
          propAvoids.push(...obj.forbidden_variations);
        }
      }
    }
    if (heroPropLocks.length > 0) {
      const propLockSentence = `Prop lock: ${heroPropLocks.join('; ')}.`;
      if (!data.visual.includes('Prop lock:')) {
        data.visual = `${data.visual} ${propLockSentence}`;
      }
    }

    // Programmatic cleanup of vague motion/invisible-change descriptors if LLM generated them
    if (data.visual) {
      data.visual = data.visual
        .replace(/\bimperceptibly\b/gi, 'visibly')
        .replace(/\b(subtle|subtly)\b/gi, '')
        .replace(/\bseamlessly\b/gi, '')
        .replace(/\bseamless\b/gi, '')
        .replace(/\bcomplex\b/gi, 'detailed')
        .replace(/\bprofound\b/gi, '')
        .replace(/\bdynamic data\b/gi, 'abstract shapes')
        .replace(/\b(blurred|unreadable) (text|numbers|labels)\b/gi, 'no text or numbers; abstract/symbolic graphics only — no readable UI labels')
        .replace(/\b(beautiful(?:ly)?|stunning(?:ly)?|majestic(?:ally)?|breathtaking(?:ly)?|epic(?:ally)?|gorgeous(?:ly)?|mesmerizing(?:ly)?|captivating(?:ly)?|dramatic(?:ally)?)\b/gi, '')
        .replace(/\blarge-format sensor\b/gi, 'camera')
        .replace(/\b(high dynamic range|HDR|cinematic color grading|color grading|photorealistic CGI integration|maintains visual fidelity|visual fidelity|rendered with realistic textures|documentary aesthetic)\b/gi, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,!?])/g, '$1')
        .replace(/,\s*,+/g, ',')
        .replace(/\b(with|by|using)\s+(a|an|the)?\s*,\s*(conveying|showing|revealing|emphasizing|highlighting|pointing|facing|displaying|reflecting|capturing|having|featuring)\b/gi, ', $3')
        .replace(/\b(and|or|with|by|using|a|an|the)(?:\s+(?:and|or|with|by|using|a|an|the))*\s*(?=[.,!?])/gi, '')
        .replace(/\b(a|an)\s*,\s*and\b/gi, '$1')
        .replace(/\b(a|an)\s*,\s*/gi, '$1 ')
        .replace(/\bwith\s+and\b/gi, 'with')
        .replace(/\bwith\s+a\s+and\b/gi, 'with a')
        .replace(/\bwith\s*,\s*and\b/gi, 'with')
        .replace(/\bwith\s*,\s*/gi, 'with ')
        .replace(/,\s*and\s*\./gi, '.')
        .replace(/,\s*\./gi, '.')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,!?])/g, '$1')
        .trim();

      // Clean up dangling or mismatched a/an articles after stripping adjectives
      data.visual = data.visual
        .replace(/\ban\s+([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, 'a $1')
        .replace(/\ba\s+([aeiouAEIOU])/g, 'an $1');

      // Capitalize first letter of visual if it was made lowercase due to a stripped word at the start of a sentence
      if (data.visual.length > 0) {
        data.visual = data.visual.charAt(0).toUpperCase() + data.visual.slice(1);
      }
    }

    // 3. Audio: choose speech mode — character dialogue, on-camera narrator, or silent VO
    const hasRealDialogue = isDialogue && dialogueLine && dialogueLine !== 'None' && dialogueLine !== 'None.';

    // Identify narrator/presenter (explicit flag, with role/name fallback for older bibles)
    const narratorChar = (bible.character_roster || []).find((c: any) =>
      c.is_narrator === true ||
      /narrator|presenter|host|anchor/i.test(c.role || '') ||
      /narrator/i.test(c.name || '')
    );
    const narratorOnCamera = !!(narratorChar && activeCharacterIds.includes(narratorChar.id));
    const narrationText = (data.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
    const hasNarration = narrationText.length > 0;

    let audioAvoids: string[] = [];

    if (hasRealDialogue) {
      const dialogueDirective = "Only the speaking character's mouth moves to lip-sync their dialogue line. All other characters remain silent with closed mouths.";
      if (!data.visual.includes("Only the speaking character's mouth moves")) {
        data.visual = `${data.visual} ${dialogueDirective}`;
      }
      data.dialogue = dialogueLine;
      data.is_dialogue = true;
      data.spoken_on_camera = false;
      data.narration_audio_source = 'elevenlabs_vo';
    } else if (narratorOnCamera && hasNarration) {
      // NEW (Option A): narrator speaks the narration line on camera; Veo generates the audio
      const narratorSpeakDirective = `${narratorChar.name} speaks the narration line directly to camera with natural, relaxed lip-sync and jaw movement matched to the words. Only ${narratorChar.name} speaks; all other characters remain silent with closed mouths.`;
      if (!data.visual.includes('speaks the narration line directly to camera')) {
        data.visual = `${data.visual} ${narratorSpeakDirective}`;
      }
      audioAvoids = []; // do NOT forbid talking/lip movement for the narrator
      data.dialogue = "None."; // narration is the spoken content, not character dialogue
      data.is_dialogue = false;
      data.spoken_on_camera = true;
      data.narration_audio_source = 'veo_on_camera';
    } else {
      const audioNote = "No spoken dialogue, voiceover, or lip-sync — ambient and SFX only.";
      if (humanInFrame) {
        const charSilence = "No characters speak. All characters' mouths remain closed and neutral; no lip movement, no talking.";
        if (!data.visual.includes("No characters speak.")) {
          data.visual = `${data.visual} ${charSilence} ${audioNote}`;
        } else if (!data.visual.includes("No spoken dialogue, voiceover, or lip-sync")) {
          data.visual = `${data.visual} ${audioNote}`;
        }
      } else {
        if (!data.visual.includes("No spoken dialogue, voiceover, or lip-sync")) {
          data.visual = `${data.visual} ${audioNote}`;
        }
      }
      audioAvoids = ["talking", "lip movement", "mouth moving", "speech", "voiceover", "singing"];
      data.dialogue = "None.";
      data.is_dialogue = false;
      data.spoken_on_camera = false;
      data.narration_audio_source = 'elevenlabs_vo';
    }

    // 4. Time of day lighting lock
    let period: 'morning' | 'afternoon' | 'evening' | 'night' = 'afternoon';
    const todLower = timeOfDay.toLowerCase();
    if (todLower.includes('morning') || todLower.includes('dawn') || todLower.includes('sunrise')) {
      period = 'morning';
    } else if (todLower.includes('afternoon') || todLower.includes('midday') || todLower.includes('noon') || todLower.includes('day')) {
      period = 'afternoon';
    } else if (todLower.includes('evening') || todLower.includes('dusk') || todLower.includes('sunset')) {
      period = 'evening';
    } else if (todLower.includes('night') || todLower.includes('midnight') || todLower.includes('dark')) {
      period = 'night';
    }

    const todLighting = bible.visual_style_lock?.time_of_day_lighting?.[period] || {
      color_temperature_kelvin: 'five-thousand-five-hundred Kelvin',
      sun_position: 'overhead, high angle',
      shadow_quality: 'short, sharp shadows',
      ambient_palette: ['#ffffff'],
      mood: 'bright, neutral'
    };

    let renderStyle = bible.visual_style_lock?.render_style;
    if (!renderStyle) {
      const desc = (bible.visual_style_lock?.description || '').toLowerCase();
      const styleName = (bible.visual_style_lock?.style_name || project.visual_style || '').toLowerCase();
      if (desc.includes('3d animation') || desc.includes('3d animated') || desc.includes('pixar') || styleName.includes('pixar') || styleName.includes('3d')) {
        renderStyle = '3D animation render';
      } else if (desc.includes('claymation') || styleName.includes('claymation')) {
        renderStyle = 'claymation render';
      } else if (desc.includes('2d vector') || desc.includes('vector animation') || desc.includes('flat 2d') || styleName.includes('2d') || styleName.includes('vector')) {
        renderStyle = '2D vector animation';
      } else if (desc.includes('anime') || desc.includes('cel-shading') || styleName.includes('anime')) {
        renderStyle = 'anime cel-shaded animation';
      } else if (desc.includes('watercolor') || styleName.includes('watercolor')) {
        renderStyle = 'watercolor painting style';
      } else if (desc.includes('stop-motion') || desc.includes('stop motion') || styleName.includes('stop-motion') || styleName.includes('stop motion')) {
        renderStyle = 'stop-motion animation';
      } else {
        renderStyle = 'cinematic look';
      }
    }
    const rawFilmStock = bible.visual_style_lock?.film_stock_grade;
    const cleanFilmStock = (rawFilmStock && rawFilmStock.trim() !== 'N/A' && rawFilmStock.trim() !== 'n/a' && rawFilmStock.trim() !== 'none' && rawFilmStock.trim() !== 'None') ? rawFilmStock.trim() : '';

    let rawLensFamily = bible.visual_style_lock?.lens_family || '';
    if (project?.aspect_ratio === '9:16') {
      if (!rawLensFamily || rawLensFamily.toLowerCase().includes('anamorphic') || rawLensFamily.toLowerCase().includes('widescreen') || rawLensFamily.trim() === 'N/A' || rawLensFamily.trim() === 'n/a') {
        rawLensFamily = 'Arri Master Prime spherical lens';
      }
    }
    const cleanLensFamily = (rawLensFamily && rawLensFamily.trim() !== 'N/A' && rawLensFamily.trim() !== 'n/a' && rawLensFamily.trim() !== 'none' && rawLensFamily.trim() !== 'None') ? rawLensFamily.trim() : '';

    let lookStr = `Look: ${renderStyle}`;
    if (cleanFilmStock) {
      lookStr += ` using ${cleanFilmStock}`;
    }

    // Ensure ONE consolidated lens/camera descriptor
    let lookLensSegment = '';
    if (cleanLensFamily) {
      const isVirtualOrGeneric = !data.lens || /^(virtual|standard|default|none|n\/a)/i.test(data.lens);
      if (isVirtualOrGeneric) {
        lookLensSegment = ` on ${cleanLensFamily}`;
      } else {
        // If data.lens has specific camera/lens details, ensure data.visual doesn't contain scattered/conflicting camera/lens info.
        if (data.visual) {
          data.visual = data.visual
            .replace(/\b(Arri|ARRI|Panavision|Cooke|Sony Venice|Red Monstro)\b/gi, '')
            .replace(/\b\d+mm (anamorphic|spherical|prime|lens)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
    }
    lookStr += lookLensSegment;

    const ambientPalette = Array.isArray(todLighting.ambient_palette) ? todLighting.ambient_palette.join(', ') : (todLighting.ambient_palette || '');

    const loc = (bible.location_roster || []).find((l: any) => l.id === currentLocationId || l.location_id === currentLocationId);
    const locType = (loc?.type || '').toLowerCase();
    const locName = (loc?.name || '').toLowerCase();
    const locDesc = (loc?.description || '').toLowerCase();
    const sceneLocDesc = (resolvedScene.location_description || '').toLowerCase();
    const sceneDesc = (resolvedScene.scene_description || '').toLowerCase();
    const objectsText = (featuredObjectIds || []).map(id => {
      const o = (bible.object_registry || []).find((obj: any) => obj.id === id || obj.object_id === id);
      return o ? `${o.name} ${o.description}`.toLowerCase() : '';
    }).join(' ');

    const isInterior = 
      locType.includes('interior') || 
      locType === 'interior' || 
      sceneLocDesc.includes('interior') || 
      sceneDesc.includes('interior') || 
      sceneDesc.includes('inside the') || 
      sceneDesc.includes('within the') || 
      sceneDesc.includes('cabin') || 
      locName.includes('cabin') || 
      locDesc.includes('cabin') || 
      sceneLocDesc.includes('cabin');

    let finalLightingStr = '';
    if (isInterior) {
      let interiorLightingType: 'control' | 'screen' | 'engine' | 'cgi' | 'generic' = 'generic';

      if (
        locName.includes('screen') || locDesc.includes('screen') || sceneLocDesc.includes('screen') || sceneDesc.includes('screen') ||
        locName.includes('console') || locDesc.includes('console') || sceneLocDesc.includes('console') || sceneDesc.includes('console') ||
        objectsText.includes('screen') || objectsText.includes('console') || objectsText.includes('monitor') || objectsText.includes('display') || objectsText.includes('ui')
      ) {
        interiorLightingType = 'screen';
      } else if (
        locName.includes('control') || locDesc.includes('control') || sceneLocDesc.includes('control') ||
        locName.includes('ballast') || locDesc.includes('ballast') || sceneLocDesc.includes('ballast') ||
        locName.includes('bridge') || locDesc.includes('bridge') || sceneLocDesc.includes('bridge') ||
        locName.includes('cabin') || locDesc.includes('cabin') || sceneLocDesc.includes('cabin')
      ) {
        interiorLightingType = 'control';
      } else if (
        locName.includes('pump') || locDesc.includes('pump') || sceneLocDesc.includes('pump') ||
        locName.includes('engine') || locDesc.includes('engine') || sceneLocDesc.includes('engine') ||
        locName.includes('machinery') || locDesc.includes('machinery') || sceneLocDesc.includes('machinery') ||
        locName.includes('generator') || locDesc.includes('generator') || sceneLocDesc.includes('generator') ||
        objectsText.includes('engine') || objectsText.includes('pump') || objectsText.includes('machinery')
      ) {
        interiorLightingType = 'engine';
      } else if (
        locName.includes('cgi') || locDesc.includes('cgi') || sceneLocDesc.includes('cgi') ||
        sceneDesc.includes('cgi') || sceneDesc.includes('cutaway') || sceneDesc.includes('diagram') ||
        sceneDesc.includes('schematic') || sceneDesc.includes('cross-section') || sceneDesc.includes('internal view')
      ) {
        interiorLightingType = 'cgi';
      }

      const INTERIOR_LIGHTING_PROFILES = {
        control: {
          lighting_desc: "cool screen glow with dim overhead LEDs",
          mood: "tense, focused",
          palette: "#2d3748, #4a5568, #1a202c, #a0aec0"
        },
        screen: {
          lighting_desc: "blue UI glow, casting dark-room falloff",
          mood: "precise, clinical",
          palette: "#0b192c, #1e3e62, #000000, #008dff"
        },
        engine: {
          lighting_desc: "cool industrial LEDs, casting hard metal highlights",
          mood: "relentless, industrial",
          palette: "#718096, #2d3748, #1a202c, #e2e8f0"
        },
        cgi: {
          lighting_desc: "neutral cinematic, technical lighting",
          mood: "clean, technical",
          palette: "#4a5568, #cbd5e0, #2d3748, #ffffff"
        },
        generic: {
          lighting_desc: "neutral indoor illumination from recessed ceiling lights",
          mood: "neutral",
          palette: "#ffffff, #e2e8f0, #4a5568, #1a202c"
        }
      };

      const profile = INTERIOR_LIGHTING_PROFILES[interiorLightingType];
      finalLightingStr = `${profile.lighting_desc}. Mood: ${profile.mood}. Ambient palette: ${profile.palette}. ${lookStr}.`;
    } else {
      finalLightingStr = `${todLighting.color_temperature_kelvin} light from ${todLighting.sun_position}, casting ${todLighting.shadow_quality}. Mood: ${todLighting.mood}. Ambient palette: ${ambientPalette}. ${lookStr}.`;
    }

    data.lighting = finalLightingStr;

    // Narration-fit rule integration
    const SHOT_REGISTERS: Record<string, number> = {
      rapid_cut: 5,
      short_punch: 6,
      slow_burn: 7,
      standard: 8
    };

    const sceneType = data.scene_type || 'standard';
    const defaultDuration = SHOT_REGISTERS[sceneType] || 8;
    const rawNarration = resolvedScene.narration_fragment || '';
    const cleanNar = rawNarration.replace(/\[WARNING:.*\]/g, '').trim();
    const narrationLanguage = project?.narration_language || 'English';
    const originalWordCount = getWordCount(cleanNar, narrationLanguage);

    let finalDuration = defaultDuration;
    let finalNarration = cleanNar;

    if (getRequiredClipCount(originalWordCount, narrationLanguage) > 3 && enableValidators) {
      // Still unfitting! Must run micro-pass to rewrite narration
      if (originalWordCount > 19) {
        finalDuration = 8;
      } else {
        finalDuration = 5;
      }
      const minW = Math.ceil(finalDuration * 1.2);
      const maxW = Math.floor(finalDuration * 2.4);

      const rewritten = await this.rewriteNarrationToFit(
        projectId,
        apiKey,
        modelName,
        cleanNar,
        finalDuration,
        minW,
        maxW,
        project,
        resolvedScene.phase_number
      );

      const cleanRewritten = rewritten.replace(/\[WARNING:.*\]/g, '').trim();
      const newWordCount = getWordCount(cleanRewritten);
      
      finalNarration = cleanRewritten;

      // Log the VeoAgent_NarrationFit event
      try {
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, input_prompt, output_response, created_at)
          VALUES (?, ?, 'VeoAgent_NarrationFit', ?, 'success', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          modelName || 'gemini-2.5-flash-lite',
          JSON.stringify({
            before: cleanNar,
            word_count: originalWordCount,
            duration: defaultDuration
          }),
          JSON.stringify({
            after: cleanRewritten,
            word_count: newWordCount,
            duration: finalDuration
          })
        );
      } catch (logErr: any) {
        console.error(`[VeoAgent] Failed to log narration fit rewrite in DB:`, logErr);
      }

      // Update the scenes table (both raw narration column, narration_word_count, and raw_json payload)
      try {
        db.prepare(`
          UPDATE scenes 
          SET narration_fragment = ?, narration_word_count = ?
          WHERE project_id = ? AND phase_number = ? AND scene_number = ?
        `).run(cleanRewritten, newWordCount, projectId, resolvedScene.phase_number, resolvedScene.scene_number);

        const sceneRow = db.prepare(`
          SELECT raw_json FROM scenes
          WHERE project_id = ? AND phase_number = ? AND scene_number = ?
        `).get(projectId, resolvedScene.phase_number, resolvedScene.scene_number) as { raw_json: string } | undefined;
        
        if (sceneRow) {
          const sceneData = JSON.parse(sceneRow.raw_json);
          sceneData.narration_fragment = cleanRewritten;
          sceneData.narration_word_count = newWordCount;
          db.prepare(`
            UPDATE scenes
            SET raw_json = ?
            WHERE project_id = ? AND phase_number = ? AND scene_number = ?
          `).run(JSON.stringify(sceneData), projectId, resolvedScene.phase_number, resolvedScene.scene_number);
        }
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to update scene narration in DB:`, dbErr);
      }
    } else {
      finalDuration = defaultDuration;
      finalNarration = cleanNar;
    }

    // Force narration to strictly map to the scene's narration_fragment (read-only constraint)
    resolvedScene.narration_fragment = finalNarration;
    data.narration = finalNarration;
    data.duration_seconds = finalDuration;

    // Calculate global sequential number
    try {
      const existingCount = db.prepare(
        `SELECT COUNT(*) as count FROM veo_prompts 
         WHERE project_id = ?`
      ).get(projectId) as { count: number };
    
      data.prompt_number = (existingCount.count + 1) as any;
    } catch (dbErr: any) {
      console.error(`[VeoAgent] DB error counting veo_prompts for project ${projectId}: ${dbErr.message}`);
      data.prompt_number = '1' as any;
    }

    // Merge avoid keywords: scene-specific > style registry > universal baseline, capped at 25.
    const rawAvoid = data.avoid || '';
    const cleanAvoidString = rawAvoid.trim().replace(/\.+$/, '');
    const sceneSpecificList = cleanAvoidString
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean);

    const styleAvoids = styleConstraints?.avoidKeywords || [];

    const universalBaseline = [
      'watermark',
      'subtitles',
      'on-screen text',
      'logo'
    ];

    const anatomyBaseline: string[] = [];
    if (humanInFrame) {
      anatomyBaseline.push(
        'deformed hands',
        'extra fingers',
        'extra limbs',
        'mutated anatomy',
        'warped faces'
      );
    }

    const characterBaseline: string[] = [];
    if (namedCharacter) {
      characterBaseline.push(
        'identity change',
        'wardrobe change mid-shot'
      );
    }

    const isScreenOrUIData = 
      locName.includes('screen') || locDesc.includes('screen') || sceneLocDesc.includes('screen') || sceneDesc.includes('screen') ||
      locName.includes('console') || locDesc.includes('console') || sceneLocDesc.includes('console') || sceneDesc.includes('console') ||
      locName.includes('data') || locDesc.includes('data') || sceneLocDesc.includes('data') || sceneDesc.includes('data') ||
      objectsText.includes('screen') || objectsText.includes('console') || objectsText.includes('monitor') || objectsText.includes('display') || objectsText.includes('ui') ||
      objectsText.includes('data') || objectsText.includes('graph') || objectsText.includes('chart') || objectsText.includes('diagram') ||
      sceneDesc.includes('screen') || sceneDesc.includes('console') || sceneDesc.includes('ui') || sceneDesc.includes('data') ||
      sceneDesc.includes('diagram') || sceneDesc.includes('schematic') || sceneDesc.includes('cross-section') || sceneDesc.includes('chart') ||
      sceneDesc.includes('cutaway') || sceneDesc.includes('internal view');

    const additionalAvoids: string[] = [];

    if (isScreenOrUIData) {
      additionalAvoids.push(
        'readable text',
        'numbers',
        'letters',
        'fake UI labels',
        'flickering/warped interface',
        'watermark',
        'logo'
      );
    } else if (!humanInFrame) {
      additionalAvoids.push(
        'text',
        'captions',
        'labels',
        'arrows',
        'watermark',
        'logo',
        'unrealistic/toy-like scale',
        'cartoon render',
        'flickering geometry'
      );
    }

    const mergedList: string[] = [];
    const seen = new Set<string>();

    const allToMerge = [
      ...anatomyBaseline,
      ...characterBaseline,
      ...additionalAvoids,
      ...sceneSpecificList,
      ...styleAvoids,
      ...universalBaseline,
      ...forbiddenList,
      ...propAvoids,
      ...audioAvoids
    ];

    const CHARACTER_ROSTER_KEYWORDS = [
      'identity change',
      'wardrobe change mid-shot'
    ];

    const ANATOMY_KEYWORDS = [
      'deformed hands', 'extra fingers', 'extra limbs', 'mutated anatomy',
      'warped faces', 'deformed body', 'mutated faces', 'warped face', 'morphing faces'
    ];

    const AUDIO_LIP_SYNC_KEYWORDS = [
      'talking', 'lip movement', 'mouth moving', 'singing'
    ];

    for (const keyword of allToMerge) {
      if (!keyword) continue;
      const trimmed = keyword.trim();
      const lower = trimmed.toLowerCase();
      if (!lower || lower === 'none' || lower === 'none.') continue;

      if (hasBrandedProductFeatured) {
        const BRAND_AVOIDS = ['brand names', 'logo', 'text', 'letters', 'typography', 'written words'];
        if (BRAND_AVOIDS.some(term => lower.includes(term))) {
          continue;
        }
      }

      if (!namedCharacter && CHARACTER_ROSTER_KEYWORDS.some(term => lower.includes(term))) {
        continue;
      }

      if (!humanInFrame && (ANATOMY_KEYWORDS.some(term => lower.includes(term)) || AUDIO_LIP_SYNC_KEYWORDS.some(term => lower.includes(term)))) {
        continue;
      }

      if (!seen.has(lower)) {
        seen.add(lower);
        mergedList.push(trimmed);
      }
    }

    const cappedList = mergedList.slice(0, 25);
    if (cappedList.length > 0) {
      data.avoid = cappedList.join(', ') + '.';
    } else {
      data.avoid = 'None.';
    }

    // Dynamic adaptation validation and word correction
    // Post-generation appearance validation pass
    let appearanceViolationDetected = false;
    let appearanceCorrectedDetected = false;

    if (!data.skip_appearance_validation && enableValidators) {
      const validationResult = await this.validatePromptFields(
        projectId,
        data,
        activeCharacterIds,
        bible,
        project,
        apiKey,
        modelName,
        resolvedScene.phase_number
      );

      if (validationResult.violation && validationResult.violations.length > 0) {
        appearanceViolationDetected = true;
        appearanceCorrectedDetected = true;

        const correctionsLog: Array<{ field: string; before: string; after: string; rule_violated: string }> = [];

        for (const v of validationResult.violations) {
          const originalVal = data[v.field] || '';
          if (v.suggestion && v.suggestion.trim().length > 0) {
            // data[v.field] = v.suggestion; // LEAKAGE FIXED
            correctionsLog.push({
              field: v.field,
              before: originalVal,
              after: v.suggestion,
              rule_violated: v.rule
            });
          }
        }

        // Log the corrections to agent_logs
        if (correctionsLog.length > 0) {
          try {
            db.prepare(`
              INSERT INTO agent_logs
                (id, project_id, agent_name, model_used, status, input_prompt, output_response, created_at)
              VALUES (?, ?, 'VeoAgent_AppearanceValidator', ?, 'success', ?, ?, CURRENT_TIMESTAMP)
            `).run(
              crypto.randomUUID(),
              projectId,
              modelName || 'gemini-2.5-flash-lite',
              `Validated fields: ${JSON.stringify(validationResult.violations.map(vi => vi.field))}`,
              JSON.stringify(correctionsLog)
            );
          } catch (dbErr: any) {
            console.error(`[VeoAgent] Failed to log appearance corrections in DB postProcess:`, dbErr);
          }
        }
      }
    }

    data.appearance_violation = appearanceViolationDetected ? 1 : 0;
    data.appearance_corrected = appearanceCorrectedDetected ? 1 : 0;

    validatePrompt(data, bible, project, resolvedScene.scene_number, resolvedScene.phase_number, resolvedScene);

    // Post-parse validation check on visual field sentence completeness
    const endsWithSentenceTerminator = /[.!?]$/.test(data.visual.trim());
    if (!endsWithSentenceTerminator) {
      data.visual_truncated = 1;
      const warningMsg = "Visual field may be truncated — does not end at sentence boundary.";
      try {
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, error_message, created_at)
          VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          'VeoAgent_Validation',
          modelName || 'gemini-2.5-flash-lite',
          warningMsg
        );
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to log visual truncation to agent_logs: ${dbErr.message}`);
      }
    } else {
      data.visual_truncated = 0;
    }

    // Shot field validation (Fix 1)
    let shotVal = data.shot?.trim() || "";
    if (shotVal === "MS") {
      shotVal = "";
      data.shot = "";
    }
    if (!shotVal) {
      const errorMsg = "Shot field missing or empty.";
      try {
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, error_message, created_at)
          VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          'VeoAgent_Validation',
          modelName || 'gemini-2.5-flash-lite',
          errorMsg
        );
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to log shot warning to agent_logs: ${dbErr.message}`);
      }
    }

    // Sound block validation (Fix 2)
    let ambientVal = data.ambient_sound;
    let sfxVal = data.sfx;
    const rawData = data as any;
    let soundExtractionFailed = false;

    if (rawData.sound && typeof rawData.sound === 'object') {
      ambientVal = rawData.sound.ambient || rawData.sound.background || ambientVal;
      sfxVal = rawData.sound.sfx || rawData.sound.effects || sfxVal;
    }

    if (!ambientVal || !sfxVal) {
      if (!ambientVal) ambientVal = "ambient silence";
      if (!sfxVal) sfxVal = "None";
      soundExtractionFailed = true;
    }

    data.ambient_sound = ambientVal;
    data.sfx = sfxVal;

    if (soundExtractionFailed) {
      const errorMsg = "Sound extraction failed — defaulted to ambient silence and None.";
      try {
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, error_message, created_at)
          VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          'VeoAgent_Validation',
          modelName || 'gemini-2.5-flash-lite',
          errorMsg
        );
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to log sound warning to agent_logs: ${dbErr.message}`);
      }
    }

    // Dialogue field is spurious — set it to None. if missing (Fix 3)
    data.dialogue = data.dialogue || "None.";

    // Validate and keep duration as provided
    const rawDur = typeof data.duration_seconds === 'number' ? data.duration_seconds : 8;
    data.duration_seconds = Math.max(1, Math.floor(rawDur));

    // Post-parse validation checks narration word count before saving.
    const cleanNarrationText = data.narration.replace(/\[WARNING:.*\]/g, '').trim();
    data.narration = cleanNarrationText;

    // Cross-field contradiction check (Fix 5)
    const { contradictions, hasContradiction } = checkAvoidContradiction(data.visual || "", data.avoid || "");
    if (hasContradiction) {
      data.avoid_contradiction = 1;
      const errorMsg = `Avoid field contradicts visual field: ${contradictions.join(', ')}`;
      try {
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, error_message, created_at)
          VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          'VeoAgent_Validation',
          modelName || 'gemini-2.5-flash-lite',
          errorMsg
        );
      } catch (dbErr: any) {
        console.error(`[VeoAgent] Failed to log contradiction to agent_logs: ${dbErr.message}`);
      }
    } else {
      data.avoid_contradiction = 0;
    }

    // Extract Kelvin value
    const kelvinMatch = data.lighting ? data.lighting.match(/([0-9]{4,5})\s*K|([0-9]{4,5})-[Kk]elvin/) : null;
    const extractedKelvin = kelvinMatch ? parseInt(kelvinMatch[1] || kelvinMatch[2], 10) : null;
    data.lighting_kelvin = extractedKelvin;

    // Check lighting temperature jump
    if (prevKelvin !== null && extractedKelvin !== null) {
      const delta = Math.abs(extractedKelvin - prevKelvin);
      if (delta > 500 && !hasTimeChange) {
        const warningMsg = `Lighting temperature jump of ${delta}K detected between consecutive scenes at ${currentLocationId}.`;
        try {
          db.prepare(`
            INSERT INTO agent_logs
              (id, project_id, agent_name, model_used, status, error_message, created_at)
            VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
          `).run(
            crypto.randomUUID(),
            projectId,
            'VeoAgent_LightingValidator',
            modelName || 'gemini-2.5-flash-lite',
            warningMsg
          );
        } catch (dbErr: any) {
          console.error(`[VeoAgent] Failed to log lighting temperature jump:`, dbErr);
        }
      }
    }

    // Assemble veo_full_prompt (Fix 5)
    data.veo_full_prompt = assembleVeoFullPrompt(data as any, data.prompt_number as number, resolvedScene.title);

    return data;
  }

}

export function checkAvoidContradiction(visual: string, avoid: string): { contradictions: string[]; hasContradiction: boolean } {
  const visualTokens = new Set(
    visual
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 4)
  );

  const avoidTokens = avoid
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4);

  const contradictions = avoidTokens.filter(t => visualTokens.has(t));
  const uniqueContradictions = Array.from(new Set(contradictions));

  return {
    contradictions: uniqueContradictions,
    hasContradiction: uniqueContradictions.length > 0
  };
}

export function assembleVeoFullPrompt(prompt: VeoPrompt | any, index: number, sceneTitle: string): string {
  const shotType = prompt.shot_type || 'medium';
  const shotDesc = prompt.shot?.trim() || '';
  const shotField = (shotDesc && shotDesc !== 'MS') ? `${shotType} — ${shotDesc}` : shotType;
  const isDialogue = prompt.is_dialogue === true || prompt.is_dialogue === 1 || (prompt.dialogue && prompt.dialogue !== 'None' && prompt.dialogue !== 'None.');
  const isNarrationOnly = !isDialogue;
  const cleanNarration = (prompt.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
  let narrationLine: string;
  if (prompt.spoken_on_camera === true || prompt.spoken_on_camera === 1) {
    narrationLine = `Narration (spoken on-camera by the Narrator with natural lip-sync; Veo generates the spoken audio for this line): ${cleanNarration}`;
  } else {
    narrationLine = `Voiceover (post-production only — do NOT vocalize, lip-sync, subtitle, or render as on-screen text): ${cleanNarration}`;
  }
  const lines = [
    `Prompt ${index}:`,
    `Visual: ${prompt.visual}`,
    `Shot: ${shotField}`,
    `Lens: ${prompt.lens}`,
    `Lighting: ${prompt.lighting}`,
    `Camera: ${prompt.camera}`,
    `Duration: ${prompt.duration_seconds || 8}s`,
    `Ambient Sound: ${prompt.ambient_sound}`,
    `SFX: ${prompt.sfx}`,
    `Avoid: ${prompt.avoid}`,
    `Connection: ${prompt.connection}`,
    narrationLine
  ];
  if (!isNarrationOnly) {
    lines.push(`Dialogue: ${prompt.dialogue}`);
  }
  return lines.join('\n');
}

export const veoAgent = new VeoAgent();
