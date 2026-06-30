export interface CulturalContext { region: string; exampleNames: string; }

export const REGIONS = [
  { value: 'auto', label: 'Auto (match language)' },
  { value: 'United States', label: 'United States' },
  { value: 'India', label: 'India' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Japan', label: 'Japan' },
  { value: 'South Korea', label: 'South Korea' },
  { value: 'China', label: 'China' },
  { value: 'Spain', label: 'Spain' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Mexico', label: 'Mexico' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'Indonesia', label: 'Indonesia' },
  { value: 'Russia', label: 'Russia' },
  { value: 'Thailand', label: 'Thailand' },
];

const REGION_MAP: Record<string, CulturalContext> = {
  'United States': { region: 'the United States', exampleNames: 'James, Emily, John, Sarah' },
  'India': { region: 'India', exampleNames: 'Arjun, Priya, Rohan, Meera, Vikram, Ananya' },
  'United Kingdom': { region: 'the United Kingdom', exampleNames: 'Oliver, Olivia, George, Amelia' },
  'Canada': { region: 'Canada', exampleNames: 'Liam, Olivia, Logan, Charlotte' },
  'Australia': { region: 'Australia', exampleNames: 'Jack, Charlotte, William, Amelia' },
  'Japan': { region: 'Japan', exampleNames: 'Haruto, Yui, Sota, Aoi' },
  'South Korea': { region: 'South Korea', exampleNames: 'Minjun, Seoyeon, Jihu, Hana' },
  'China': { region: 'China', exampleNames: 'Wei, Mei, Hao, Lin' },
  'Spain': { region: 'Spain', exampleNames: 'Mateo, Sofía, Diego, Valentina' },
  'France': { region: 'France', exampleNames: 'Lucas, Camille, Hugo, Léa' },
  'Germany': { region: 'Germany', exampleNames: 'Lukas, Hannah, Felix, Mia' },
  'Brazil': { region: 'Brazil', exampleNames: 'Lucas, Beatriz, Gabriel, Larissa' },
  'Mexico': { region: 'Mexico', exampleNames: 'Santiago, Sofía, Sebastián, Valentina' },
  'Middle East': { region: 'the Arab world / Middle East', exampleNames: 'Omar, Layla, Khalid, Fatima' },
  'Indonesia': { region: 'Indonesia', exampleNames: 'Budi, Sari, Adi, Dewi' },
  'Russia': { region: 'Russia', exampleNames: 'Dmitry, Elena, Sergey, Maria' },
  'Thailand': { region: 'Thailand', exampleNames: 'Somchai, Sunee, Kitti, Malee' },
};

const LANGUAGE_REGION_MAP: Record<string, CulturalContext> = {
  english:   { region: 'English-speaking regions (US/UK/Canada/Australia/etc.)', exampleNames: 'James, Emily, John, Sarah' },
  hindi:     { region: 'India', exampleNames: 'Arjun, Priya, Rohan, Meera, Vikram, Ananya' },
  tamil:     { region: 'Tamil Nadu, South India', exampleNames: 'Karthik, Divya, Suresh, Lakshmi' },
  telugu:    { region: 'Andhra/Telangana, South India', exampleNames: 'Ravi, Sita, Naveen, Anjali' },
  bengali:   { region: 'Bengal', exampleNames: 'Arnab, Riya, Sourav, Mou' },
  marathi:   { region: 'Maharashtra, India', exampleNames: 'Sachin, Snehal, Omkar, Aarti' },
  spanish:   { region: 'Spanish-speaking regions (Spain / Latin America)', exampleNames: 'Mateo, Sofía, Diego, Valentina' },
  french:    { region: 'France', exampleNames: 'Lucas, Camille, Hugo, Léa' },
  german:    { region: 'Germany', exampleNames: 'Lukas, Hannah, Felix, Mia' },
  japanese:  { region: 'Japan', exampleNames: 'Haruto, Yui, Sota, Aoi' },
  korean:    { region: 'South Korea', exampleNames: 'Minjun, Seoyeon, Jihu, Hana' },
  mandarin:  { region: 'China', exampleNames: 'Wei, Mei, Hao, Lin' },
  chinese:   { region: 'China', exampleNames: 'Wei, Mei, Hao, Lin' },
  arabic:    { region: 'the Arab world / Middle East', exampleNames: 'Omar, Layla, Khalid, Fatima' },
  portuguese:{ region: 'Brazil', exampleNames: 'Lucas, Beatriz, Gabriel, Larissa' },
  indonesian:{ region: 'Indonesia', exampleNames: 'Budi, Sari, Adi, Dewi' },
  russian:   { region: 'Russia', exampleNames: 'Dmitry, Elena, Sergey, Maria' },
  thai:      { region: 'Thailand', exampleNames: 'Somchai, Sunee, Kitti, Malee' },
};

export function getCulturalContext(language: string, region?: string): CulturalContext | null {
  if (region && region.trim().toLowerCase() !== 'auto') {
    const key = region.trim();
    if (REGION_MAP[key]) {
      return REGION_MAP[key];
    }
    return {
      region: key,
      exampleNames: `authentic, common names from ${key} in Latin script`,
    };
  }

  if (!language) return null;
  const key = language.trim().toLowerCase();
  const normalizedKey = key === 'en' ? 'english' : key;
  return LANGUAGE_REGION_MAP[normalizedKey] || {
    region: `the region where ${language} is predominantly spoken`,
    exampleNames: `authentic, common names from that region in Latin script`,
  };
}

export function buildCulturalInstruction(language: string, region?: string): string {
  const ctx = getCulturalContext(language, region);
  if (!ctx) return '';
  return [
    '===== CULTURAL SETTING (CONDITIONAL DEFAULT) =====',
    `Narration language is "${language}". UNLESS the video's subject or Title Seed specifies or implies its own country, region, or locale (in which case that subject geography takes precedence), set the cultural backdrop of the ENTIRE video to a ${ctx.region} context. Apply to ALL characters, locations, and objects:`,
    `- Characters: people of ${ctx.region} with region-appropriate appearance/ethnicity. Use authentic ${ctx.region} names in LATIN SCRIPT ONLY (e.g., ${ctx.exampleNames}). Do NOT use Western names like Alex/John/Emily unless the topic/geography explicitly requires it. NEVER use non-Latin script for names.`,
    `- Clothing, food, props, signage, branding: region-appropriate to ${ctx.region}.`,
    `- Locations & environment: ${ctx.region} architecture, streets, vehicles, businesses, landscape.`,
    `- DESCRIBE EVERYTHING IN ENGLISH. The cultural setting changes WHO and WHAT appears — NOT the language of the description. Only the narration is in "${language}".`,
    '==================================================',
  ].join('\n');
}
