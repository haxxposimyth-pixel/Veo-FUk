import { resolveLanguageRules } from './language-rules';
import { SCENE_DURATION_SECONDS } from '../constants';

export const MIN_WORDS_PER_SECOND = 1.2;
export const MAX_WORDS_PER_SECOND = 2.4;

export function getWordCount(text: string, language: string = 'English'): number {
  if (!text) return 0;
  // Ignore warnings or special markers when counting words
  const cleanText = text.replace(/\[WARNING:.*\]/g, '').trim();
  const rules = resolveLanguageRules(language);
  if (rules.wordCountStrategy === 'char') {
    return cleanText.replace(/\s/g, '').length;
  } else {
    return cleanText.split(/\s+/).filter(Boolean).length;
  }
}

export function narrationFitsDuration(_words: number, _seconds: number): boolean {
  return true;
}

export function getRequiredClipCount(words: number, language: string = 'English'): number {
  const rules = resolveLanguageRules(language);
  const divisor = rules.unitsPerClipDivisor;
  const minClips = (rules.wordCountStrategy === 'char' && words > 0) ? 2 : 1;
  return Math.min(3, Math.max(minClips, Math.ceil(words / divisor)));
}

export function getDurationAwareClipCount(
  words: number,
  language: string = 'English',
  pacingFactor: number = 1.0,
  targetClipLength: number = SCENE_DURATION_SECONDS
): number {
  if (words <= 0) return 0;
  const rules = resolveLanguageRules(language);
  const unitsPerMinute = rules.unitsPerMinute || 150;
  const secondsPerUnit = 60 / unitsPerMinute;
  const spokenSeconds = words * secondsPerUnit;
  return (spokenSeconds / targetClipLength) * pacingFactor;
}


export function getSentenceParts(text: string, language: string = 'English'): string[] {
  if (!text) return [];
  const cleanText = text.replace(/\[WARNING:.*\]/g, '').trim();
  const rules = resolveLanguageRules(language);
  const terminators = rules.terminators;
  const divisor = rules.unitsPerClipDivisor;

  if (terminators === '') {
    // Thai or languages with no terminal marks: split on spaces as phrase boundaries
    const phraseParts = cleanText.split(/\s+/).filter(Boolean);
    if (phraseParts.length > 1) {
      return phraseParts;
    }
    // Fallback to char-based segmentation using unitsPerClipDivisor
    return segmentByChars(cleanText, divisor);
  }

  // Build regex dynamically
  const escaped = terminators.replace(/[\\^$\-*+?.()|[\]{}]/g, '\\$&');
  const splitRegex = rules.wordCountStrategy === 'char'
    ? new RegExp(`([${escaped}]+(?:["'”’)]*))`)
    : new RegExp(`([${escaped}]+(?:["'”’)]*)(?:\\s+|$))`);
  const rawParts = cleanText.split(splitRegex);
  const sentenceParts: string[] = [];
  for (let i = 0; i < rawParts.length; i += 2) {
    const pText = rawParts[i];
    const punct = rawParts[i + 1] || '';
    const combined = (pText + punct).trim();
    if (combined) {
      sentenceParts.push(combined);
    }
  }

  // Special case: wordCountStrategy === 'char' with no marks in the text
  if (sentenceParts.length <= 1 && rules.wordCountStrategy === 'char') {
    // Check if text actually has any terminator mark
    const hasTerminator = new RegExp(`[${escaped}]`).test(cleanText);
    if (!hasTerminator) {
      return segmentByChars(cleanText, divisor);
    }
  }

  return sentenceParts;
}

function segmentByChars(text: string, divisor: number): string[] {
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += divisor) {
    const chunk = text.slice(i, i + divisor).trim();
    if (chunk) {
      segments.push(chunk);
    }
  }
  return segments;
}

export function splitNarrationIntoFragments(narrationText: string, clipCount: number, language: string = 'English'): string[] {
  if (clipCount === 1) {
    return [narrationText.trim()];
  }

  // Strip [WARNING:...] markers
  const cleanText = narrationText.replace(/\[WARNING:.*\]/g, '').trim();

  const getOptimalGrouping = (parts: string[]): string[] => {
    const n = parts.length;
    if (n <= clipCount) {
      return parts;
    }

    let bestSplits: number[] = [];
    let minVariance = Infinity;
    const wordCounts = parts.map(p => getWordCount(p, language));

    const search = (currentIndex: number, currentSplits: number[]) => {
      if (currentSplits.length === clipCount - 1) {
        const groups: number[][] = [];
        let start = 0;
        for (const split of currentSplits) {
          groups.push(wordCounts.slice(start, split));
          start = split;
        }
        groups.push(wordCounts.slice(start));

        const counts = groups.map(g => g.reduce((a, b) => a + b, 0));
        const mean = counts.reduce((a, b) => a + b, 0) / clipCount;
        const variance = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);

        if (variance < minVariance) {
          minVariance = variance;
          bestSplits = [...currentSplits];
        }
        return;
      }

      const remainingSplits = clipCount - 1 - currentSplits.length;
      const maxIndex = n - remainingSplits;
      for (let i = currentIndex + 1; i <= maxIndex; i++) {
        currentSplits.push(i);
        search(i, currentSplits);
        currentSplits.pop();
      }
    };

    search(0, []);

    const resultGroups: string[] = [];
    let start = 0;
    for (const split of bestSplits) {
      resultGroups.push(parts.slice(start, split).join(' '));
      start = split;
    }
    resultGroups.push(parts.slice(start).join(' '));
    return resultGroups.map(s => s.trim());
  };

  const sentenceParts = getSentenceParts(cleanText, language);
  let currentFragments = [...sentenceParts];

  // If we have fewer sentence fragments than clipCount, try to split at clause boundaries (; : —)
  if (currentFragments.length < clipCount) {
    let changed = true;
    while (currentFragments.length < clipCount && changed) {
      changed = false;
      for (let i = 0; i < currentFragments.length; i++) {
        const fragment = currentFragments[i];
        const match = /[;:\u2014]/.exec(fragment);
        if (match) {
          const index = match.index;
          const firstPart = fragment.slice(0, index).trim() + '.';
          let secondPart = fragment.slice(index + 1).trim();
          if (secondPart) {
            // Capitalize the first letter of secondPart
            secondPart = capitalizeFirstLetter(secondPart);
            currentFragments.splice(i, 1, firstPart, secondPart);
            changed = true;
            break;
          }
        }
      }
    }
  }

  let finalParts: string[] = [];
  if (currentFragments.length > clipCount) {
    finalParts = getOptimalGrouping(currentFragments);
  } else {
    finalParts = currentFragments;
  }

  // Post-split validation step
  let validatedFragments: string[] = [];
  for (let i = 0; i < finalParts.length; i++) {
    let val = finalParts[i].trim();
    while (true) {
      if (val.endsWith(',.')) {
        val = val.substring(0, val.length - 2).trim();
      } else if (val.endsWith(',')) {
        val = val.substring(0, val.length - 1).trim();
      } else {
        break;
      }
    }
    
    if (val !== '') {
      validatedFragments.push(val);
    }
  }

  for (let i = 0; i < validatedFragments.length; i++) {
    validatedFragments[i] = capitalizeFirstLetter(validatedFragments[i]);
  }

  return validatedFragments;
}

function capitalizeFirstLetter(text: string): string {
  if (!text) return '';
  const match = /[a-zA-Z]/.exec(text);
  if (match) {
    const idx = match.index;
    return text.slice(0, idx) + text.charAt(idx).toUpperCase() + text.slice(idx + 1);
  }
  return text;
}
