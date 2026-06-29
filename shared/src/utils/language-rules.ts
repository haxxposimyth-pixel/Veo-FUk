export interface LanguageRules {
  script: string;
  direction: 'ltr' | 'rtl';
  terminators: string;          // char-class BODY for sentence-ending marks, e.g. ".!?…" ; '' if none (Thai)
  wordCountStrategy: 'space' | 'char';
  unitsPerMinute: number;       // replaces the hardcoded 150 wpm, per language
  unitsPerClipDivisor: number;  // replaces the hardcoded 14.4, per language
  purityKey?: string;           // maps to language-purity NON_LATIN_SCRIPTS
  cultureKey?: string;          // maps to culture-map
  narrationHint: string;        // the per-language narration instruction (replaces hardcoded "if Hindi…")
}

const RULES_MAP: Record<string, LanguageRules> = {
  english: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  spanish: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  french: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  german: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  portuguese: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  indonesian: {
    script: 'latin',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    narrationHint: '',
  },
  hindi: {
    script: 'devanagari',
    direction: 'ltr',
    terminators: '।॥.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 140,
    unitsPerClipDivisor: 13,
    purityKey: 'Hindi',
    cultureKey: 'hindi',
    narrationHint: "Write in natural conversational Hinglish using Devanagari script for narration_text. Keep everyday words in Hindi but use common English technical terms transliterated into Devanagari (e.g. 'कंप्रेसर' instead of 'संपीड़क', 'रेफ्रिजरेंट', 'इन्वर्टर', 'क्लोज्ड लूप'). Short uppercase Latin abbreviations (such as AC, CGI, PCB, R32) may remain in Latin script. End every sentence with a danda '।' character, never a period ('.').",
  },
  marathi: {
    script: 'devanagari',
    direction: 'ltr',
    terminators: '।॥.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 140,
    unitsPerClipDivisor: 13,
    purityKey: 'Hindi', // Marathi shares the Devanagari range
    cultureKey: 'marathi',
    narrationHint: "Write in pure Devanagari script. End every sentence with a danda '।' character. Do NOT end sentences with a period ('.'). No Roman characters or English words in narration_text.",
  },
  russian: {
    script: 'cyrillic',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    purityKey: 'Russian',
    cultureKey: 'russian',
    narrationHint: "Write in Cyrillic script.",
  },
  korean: {
    script: 'hangul',
    direction: 'ltr',
    terminators: '.!?…',
    wordCountStrategy: 'space',
    unitsPerMinute: 300,
    unitsPerClipDivisor: 14.4,
    purityKey: 'Korean',
    cultureKey: 'korean',
    narrationHint: "Write in Hangul script.",
  },
  japanese: {
    script: 'cjk',
    direction: 'ltr',
    terminators: '。！？…!?',
    wordCountStrategy: 'char',
    unitsPerMinute: 350,
    unitsPerClipDivisor: 40,
    purityKey: 'Japanese',
    cultureKey: 'japanese',
    narrationHint: "Use natural Japanese with full-width punctuation 。！？.",
  },
  chinese: {
    script: 'cjk',
    direction: 'ltr',
    terminators: '。！？…',
    wordCountStrategy: 'char',
    unitsPerMinute: 350,
    unitsPerClipDivisor: 40,
    purityKey: 'Chinese',
    cultureKey: 'chinese',
    narrationHint: "Write in simplified Chinese characters. Use full-width Chinese punctuation 。！？.",
  },
  mandarin: {
    script: 'cjk',
    direction: 'ltr',
    terminators: '。！？…',
    wordCountStrategy: 'char',
    unitsPerMinute: 350,
    unitsPerClipDivisor: 40,
    purityKey: 'Chinese',
    cultureKey: 'chinese',
    narrationHint: "Write in simplified Chinese characters. Use full-width Chinese punctuation 。！？.",
  },
  thai: {
    script: 'thai',
    direction: 'ltr',
    terminators: '',
    wordCountStrategy: 'char',
    unitsPerMinute: 400,
    unitsPerClipDivisor: 50,
    purityKey: 'Thai',
    cultureKey: 'thai',
    narrationHint: "Thai has no sentence-ending punctuation; break at natural phrase boundaries (spaces).",
  },
  arabic: {
    script: 'arabic',
    direction: 'rtl',
    terminators: '.!?؟…',
    wordCountStrategy: 'space',
    unitsPerMinute: 150,
    unitsPerClipDivisor: 14.4,
    purityKey: 'Arabic',
    cultureKey: 'arabic',
    narrationHint: "Write in Arabic script (right-to-left).",
  },
};

export function resolveLanguageRules(language: string): LanguageRules {
  if (!language) {
    return RULES_MAP.english;
  }
  const clean = language.trim().toLowerCase();
  return RULES_MAP[clean] || RULES_MAP.english;
}

export const AIRCRAFT_MODEL_PHONETIC_MAP: Record<string, { english: string; hindi: string }> = {
  '707': { english: 'seven oh seven', hindi: 'सेवन ओ सेवन' },
  '717': { english: 'seven seventeen', hindi: 'सेवन सेवेंटीन' },
  '727': { english: 'seven twenty-seven', hindi: 'सेवन ट्वेंटी सेवन' },
  '737': { english: 'seven thirty-seven', hindi: 'सेवन थर्टी सेवन' },
  '747': { english: 'seven forty-seven', hindi: 'सेवन फोर्टी सेवन' },
  '757': { english: 'seven fifty-seven', hindi: 'सेवन फिफ्टी सेवन' },
  '767': { english: 'seven sixty-seven', hindi: 'सेवन सिक्सटी सेवन' },
  '777': { english: 'seven seventy-seven', hindi: 'सेवन सेवेंटी सेवन' },
  '787': { english: 'seven eighty-seven', hindi: 'सेवन एटी सेवन' },
  '797': { english: 'seven ninety-seven', hindi: 'सेवन नाइंटी सेवन' }
};

const MODEL_VARIANTS_MAP: Record<string, string> = {
  // 707
  'seven\\s+hundred\\s+(?:and\\s+)?seven': 'seven oh seven',
  'seven[- ]oh[- ]seven': 'seven oh seven',
  'seven[- ]zero[- ]seven': 'seven oh seven',
  // 717
  'seven\\s+hundred\\s+(?:and\\s+)?seventeen': 'seven seventeen',
  'seven[- ]seventeen': 'seven seventeen',
  // 727
  'seven\\s+hundred\\s+(?:and\\s+)?twenty[- ]seven': 'seven twenty-seven',
  'seven[- ]twenty[- ]seven': 'seven twenty-seven',
  // 737
  'seven\\s+hundred\\s+(?:and\\s+)?thirty[- ]seven': 'seven thirty-seven',
  'seven[- ]thirty[- ]seven': 'seven thirty-seven',
  'seven[- ]three[- ]seven': 'seven thirty-seven',
  // 747
  'seven\\s+hundred\\s+(?:and\\s+)?forty[- ]seven': 'seven forty-seven',
  'seven[- ]forty[- ]seven': 'seven forty-seven',
  'seven[- ]four[- ]seven': 'seven forty-seven',
  // 757
  'seven\\s+hundred\\s+(?:and\\s+)?fifty[- ]seven': 'seven fifty-seven',
  'seven[- ]fifty[- ]seven': 'seven fifty-seven',
  'seven[- ]five[- ]seven': 'seven fifty-seven',
  // 767
  'seven\\s+hundred\\s+(?:and\\s+)?sixty[- ]seven': 'seven sixty-seven',
  'seven[- ]sixty[- ]seven': 'seven sixty-seven',
  'seven[- ]six[- ]seven': 'seven sixty-seven',
  // 777
  'seven\\s+hundred\\s+(?:and\\s+)?seventy[- ]seven': 'seven seventy-seven',
  'seven[- ]seventy[- ]seven': 'seven seventy-seven',
  'seven[- ]seven[- ]seven': 'seven seventy-seven',
  // 787
  'seven\\s+hundred\\s+(?:and\\s+)?eighty[- ]seven': 'seven eighty-seven',
  'seven[- ]eighty[- ]seven': 'seven eighty-seven',
  'seven[- ]eight[- ]seven': 'seven eighty-seven',
  // 797
  'seven\\s+hundred\\s+(?:and\\s+)?ninety[- ]seven': 'seven ninety-seven',
  'seven[- ]ninety[- ]seven': 'seven ninety-seven',
  'seven[- ]nine[- ]seven': 'seven ninety-seven'
};

export function collapseSpelledModelVariants(text: string): string {
  let result = text;
  for (const [pattern, canonical] of Object.entries(MODEL_VARIANTS_MAP)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    result = result.replace(regex, canonical);
  }
  return result;
}

export function isAircraftModelDesignation(numStr: string, fullText: string, matchIndex: number): boolean {
  if (!AIRCRAFT_MODEL_PHONETIC_MAP[numStr]) {
    return false;
  }

  const textLower = fullText.toLowerCase();

  const quantityKeywords = [
    'ton', 'tons', 'worker', 'workers', 'container', 'containers', 'passenger', 'passengers',
    'people', 'person', 'men', 'women', 'crew', 'employee', 'employees', 'feet', 'meter', 'meters',
    'part', 'parts', 'degree', 'degrees', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds',
    'kg', 'kilogram', 'kilograms', 'pound', 'pounds', 'dollar', 'dollars', 'rupee', 'rupees'
  ];
  
  const afterMatch = textLower.slice(matchIndex + numStr.length).trim();
  const nextWordMatch = afterMatch.match(/^[a-z]+/i);
  if (nextWordMatch) {
    const nextWord = nextWordMatch[0].toLowerCase();
    if (quantityKeywords.includes(nextWord)) {
      return false;
    }
  }

  const contextKeywords = [
    'boeing', 'airbus', 'dreamliner', 'aircraft', 'plane', 'planes', 'jet', 'jets',
    'model', 'flight', 'flights', 'factory', 'factories', 'wing', 'wings', 'fuselage',
    'rollout', 'everett', 'assembly', 'tarmac', 'hangar', 'runway', 'runways',
    'बोइंग', 'फैक्ट्री', 'ड्रीमलाइनर', 'असेंबल', 'रनवे', 'विमान', 'प्लेन', 'विंग'
  ];

  return contextKeywords.some(keyword => textLower.includes(keyword));
}

export function getAircraftModelSpokenForm(numStr: string, language: string): string | null {
  const mapping = AIRCRAFT_MODEL_PHONETIC_MAP[numStr];
  if (!mapping) return null;
  const langLower = (language || '').toLowerCase().trim();
  if (langLower === 'hindi') {
    return mapping.hindi;
  }
  return mapping.english;
}

export function numberToWords(numStr: string): string {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;
  if (num === 0) return 'zero';

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (num < 20) return ones[num];
  if (num < 100) {
    return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ones[num % 10] : '');
  }
  if (num < 1000) {
    const hundredPart = ones[Math.floor(num / 100)] + ' hundred';
    const remainder = num % 100;
    if (remainder === 0) return hundredPart;
    return hundredPart + ' and ' + numberToWords(remainder.toString());
  }
  return numStr;
}

export function normalizeTextNumbers(text: string, language: string): string {
  if (!text) return '';

  let result = text;
  const langLower = (language || '').toLowerCase().trim();

  // 1. Collapse spelled-out English variants first (if English target)
  if (langLower === 'english') {
    result = collapseSpelledModelVariants(result);
  }

  // 2. Normalize digit occurrences
  result = result.replace(/\b\d+\b/g, (match: string, offset: number) => {
    if (isAircraftModelDesignation(match, result, offset)) {
      const spoken = getAircraftModelSpokenForm(match, language);
      if (spoken) {
        return spoken;
      }
    }

    let tokenStart = offset;
    while (tokenStart > 0 && /\S/.test(result[tokenStart - 1])) {
      tokenStart--;
    }
    let tokenEnd = offset + match.length;
    while (tokenEnd < result.length && /\S/.test(result[tokenEnd])) {
      tokenEnd++;
    }
    const fullToken = result.substring(tokenStart, tokenEnd);

    const isPartofCode = result[offset - 1] === '-' ||
                         result[offset + match.length] === '-' ||
                         /[a-zA-Z]/.test(fullToken);

    if (isPartofCode) {
      return match;
    }

    if (langLower === 'english') {
      const parsed = parseInt(match, 10);
      if (!isNaN(parsed) && parsed < 1000) {
        return numberToWords(match);
      }
    }

    return match;
  });

  return result;
}

export function cleanTopicScaffolding(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Strip known scaffolding labels (case-insensitive, tolerant of spaces)
  cleaned = cleaned.replace(/^\s*Video\s+Subject:\s*/gi, '');
  cleaned = cleaned.replace(/\bVideo\s+Subject:\s*/gi, '');
  cleaned = cleaned.replace(/\bTOPICS\s+COVERED:\s*/gi, '');
  cleaned = cleaned.replace(/\bGOAL\s+OF\s+THE\s+VIDEO:\s*/gi, '');

  // Reflow: clean up extra whitespace, consecutive empty lines, etc.
  cleaned = cleaned.replace(/\r\n/g, '\n');
  
  // Trim leading/trailing spaces on each line, and overall
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n\n+/g, '\n\n')
    .trim();

  return cleaned;
}
