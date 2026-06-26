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
