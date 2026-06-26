/**
 * Language Purity Utility for YT_Prompt.ai
 * Supported languages: Hindi, English, Japanese, Chinese, Russian, German, Thai, Indonesian.
 */

import { resolveLanguageRules } from './language-rules';

// Mapping of non-Latin languages to their target Unicode script checks
const NON_LATIN_SCRIPTS: Record<string, RegExp> = {
  Hindi: /[\u0900-\u097F]/, // Devanagari range
  Japanese: /[\u3040-\u30FF\u4E00-\u9FFF\uFF66-\uFF9D]/, // Hiragana, Katakana, CJK Ideographs, Halfwidth Katakana
  Chinese: /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/, // CJK Ideographs, Ext-A, Compatibility
  Russian: /[\u0400-\u04FF]/, // Cyrillic range
  Thai: /[\u0E00-\u0E7F]/, // Thai range
  Korean: /[\uAC00-\uD7AF\u1100-\u11FF]/, // Korean range
  Arabic: /[\u0600-\u06FF]/, // Arabic range
};



// Script range check to detect non-Latin characters bleeding into Latin targets
const NON_LATIN_BLEED_REGEX = /[\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF\uFF66-\uFF9D\u3400-\u4DBF\uF900-\uFAFF\u0400-\u04FF\u0E00-\u0E7F\u0600-\u06FF\uAC00-\uD7AF\u1100-\u11FF]/;

export interface PurityResult {
  ok: boolean;
  foreignWords: string[];
  note?: string;
}

/**
 * Checks if a narration text is free of foreign-script bleed for a target language.
 * Numbers, whitespace, punctuation, and allowed tokens are ignored.
 * Returns a list of suspected foreign words.
 */
export function checkNarrationPurity(
  text: string,
  language: string,
  opts?: { allowedTokens?: string[] }
): PurityResult {
  if (!text) {
    return { ok: true, foreignWords: [] };
  }

  const rules = resolveLanguageRules(language);
  const purityKey = rules.purityKey;

  const isNonLatin = purityKey && purityKey in NON_LATIN_SCRIPTS;
  const isLatin = !purityKey && rules.script === 'latin';

  // If the language is not explicitly supported, skip purity check
  if (!isNonLatin && !isLatin) {
    return { ok: true, foreignWords: [], note: `Purity check skipped: unsupported language "${language}"` };
  }

  let cleanText = text;

  // 1. Strip allowed tokens (case-insensitive) first, replacing them with spaces
  if (opts?.allowedTokens && opts.allowedTokens.length > 0) {
    // Sort allowed tokens by length descending to match longer strings first
    const sortedTokens = [...opts.allowedTokens]
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .sort((a, b) => b.length - a.length);

    for (const token of sortedTokens) {
      const escaped = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      // If the token starts/ends with a word character, enforce word boundaries
      const startBoundary = /^\w/.test(token) ? '\\b' : '';
      const endBoundary = /\w$/.test(token) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, 'gi');
      cleanText = cleanText.replace(regex, ' ');
    }
  }

  // 2. Strip digits and punctuation, replacing them with spaces
  // Includes standard ASCII symbols, brackets, slashes, plus, and script-specific punctuation like danda or full-width stops.
  const sanitized = cleanText.replace(/[\d.,\/#!$%\^&\*;:{}=\-_`~()?"'’[\]<>\\|+。，、？！：；「」『』—…।॥]/g, ' ');

  // 3. Tokenize remaining text into words (letter-runs)
  const words = sanitized.split(/\s+/).filter(Boolean);

  const foreignWords: string[] = [];

  if (isNonLatin) {
    const targetRegex = NON_LATIN_SCRIPTS[purityKey!];
    for (const word of words) {
      // A word is foreign in a non-Latin target if it contains absolutely NO characters from the target script
      const isAllowedLatinAbbreviation = /^[A-Z0-9]{1,5}$/.test(word);
      if (!targetRegex.test(word) && !isAllowedLatinAbbreviation) {
        foreignWords.push(word);
      }
    }
  } else if (isLatin) {
    // NOTE: This cannot distinguish between different Latin-script languages (e.g. English vs German vs Indonesian)
    // as they all share the same Latin script. It only detects non-Latin character bleed.
    for (const word of words) {
      if (NON_LATIN_BLEED_REGEX.test(word)) {
        foreignWords.push(word);
      }
    }
  }

  // Remove duplicate foreign words and filter out empty strings
  const uniqueForeignWords = Array.from(new Set(foreignWords)).filter(Boolean);

  return {
    ok: uniqueForeignWords.length === 0,
    foreignWords: uniqueForeignWords,
  };
}
