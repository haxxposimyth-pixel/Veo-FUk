import logger from './logger';
import { VeoPromptData, ProductionBible, Project, checkNarrationPurity, numberToWords as sharedNumberToWords, normalizeTextNumbers } from 'shared';

export const numberToWords = sharedNumberToWords;

export function validatePrompt(
  prompt: VeoPromptData,
  bible: ProductionBible,
  project: Project,
  sceneNumber: number | string = 'unknown',
  phaseNumber?: number
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

  // 3. Normalize numbers for narration only
  if (typeof prompt.narration === 'string') {
    const narrationLanguage = project.narration_language || 'English';
    prompt.narration = normalizeTextNumbers(prompt.narration, narrationLanguage);
  }

  // 4. Avoid list checks
  let avoidItems = prompt.avoid.split(',').map(i => i.trim()).filter(Boolean);
  const mandatoryAvoids = ['modern logo', 'smartphone screen', 'digital artifacts', 'motion blur', 'neon lights'];
  
  // Ensure mandatory elements are present
  for (const item of mandatoryAvoids) {
    if (!avoidItems.some(existing => existing.toLowerCase().includes(item.toLowerCase()))) {
      avoidItems.push(item);
    }
  }

  // Production Bible forbidden elements
  const bibleData = (bible as any).visual_style_lock ? bible : (bible.raw_json ? JSON.parse(bible.raw_json) : {});
  const forbidden = bibleData.visual_style_lock?.forbidden_elements || [];
  for (const item of forbidden) {
    if (!avoidItems.some(existing => existing.toLowerCase().includes(item.toLowerCase()))) {
      avoidItems.push(item);
    }
  }

  // Keep unique items
  avoidItems = Array.from(new Set(avoidItems));

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
    // Keep mandatory/bible ones first, slice to 10
    avoidItems = avoidItems.slice(0, 10);
  }

  prompt.avoid = avoidItems.join(', ') + '.';

  // 5. Narration validation
  const cleanNarration = prompt.narration.replace(/\[WARNING:.*\]/g, '').trim();
  const narrationWords = cleanNarration.split(/\s+/).filter(Boolean);

  // B. Forbidden weak words
  const forbiddenWords = ['very', 'really', 'simply', 'just', 'truly', 'literally', 'actually', 'perhaps', 'maybe', 'somehow'];
  const foundForbidden = narrationWords.filter(w => 
    forbiddenWords.includes(w.toLowerCase().replace(/[^a-z]/g, ''))
  );
  if (foundForbidden.length > 0) {
    errors.push(`Narration contains forbidden weak words: ${foundForbidden.join(', ')}`);
  }

  // C. Start with A or The
  if (narrationWords.length > 0) {
    const firstWord = narrationWords[0].toLowerCase().replace(/[^a-z]/g, '');
    if (['a', 'an', 'the'].includes(firstWord)) {
      errors.push(`Narration starts with a forbidden article: "${narrationWords[0]}"`);
    }
  }

  // D. End with conjunction
  if (narrationWords.length > 0) {
    const lastWord = narrationWords[narrationWords.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    if (['and', 'but', 'while', 'as'].includes(lastWord)) {
      errors.push(`Narration ends with a conjunction: "${narrationWords[narrationWords.length - 1]}"`);
    }
  }

  // E. Single sentence check
  const sentenceCount = (cleanNarration.match(/[.!?]/g) || []).length;
  if (sentenceCount === 0) {
    errors.push(`Narration must contain at least one complete sentence (found 0 sentence terminators)`);
  }

  // 6. Language purity check
  const BRAND_WHITELIST = ['STING', 'VVS', 'Veo', 'Google', 'Gemini'];
  const charNames = (bibleData.character_roster || []).map((c: any) => c.name).filter(Boolean);
  const allowedTokens = [...BRAND_WHITELIST, ...charNames];
  if (prompt.narration) {
    const purity = checkNarrationPurity(prompt.narration, project.narration_language || 'English', { allowedTokens });
    if (!purity.ok) {
      errors.push(`Narration purity (${project.narration_language}): possible foreign-script words — ${purity.foreignWords.join(', ')}`);
    }
  }

  // English-only regression check for technical fields (visual, camera, lens, lighting, etc.)
  const englishFields = ['visual', 'shot', 'lens', 'lighting', 'camera', 'avoid'];
  const nonLatinRegex = /[^\x00-\x7F\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u2000-\u206F\u20A0-\u20CF]/;
  for (const field of englishFields) {
    const val = (prompt as any)[field];
    if (typeof val === 'string' && nonLatinRegex.test(val)) {
      errors.push(`Field ${field} must be English — contains non-Latin script`);
    }
  }

  // Log all validation errors
  if (errors.length > 0) {
    logger.warn(
      `Prompt validation issues for scene ${sceneNumber}: ${errors.join(' | ')}`
    );
  }

  return prompt; // always save, never block
}
