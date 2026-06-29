import { BaseAgent } from './base-agent';
import { titleMetadataSchema, VideoMetadataData } from 'shared';
import { ProjectRepository } from '../db/repositories/project.repo';

export class TitleMetadataAgent extends BaseAgent {
  constructor() {
    super('TitleMetadataAgent');
  }

  async run(
    projectId: string,
    topic: string,
    bibleData: any,
    phases: any[],
    storyAnalysisSummary: string | null,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number }
  ): Promise<VideoMetadataData> {
    const project = ProjectRepository.findById(projectId);
    const narrationLanguage = project?.narration_language || 'English';

    const characterSummary = (bibleData.character_roster || [])
      .map((c: any) => `- Name: ${c.name}, Role: ${c.role}, Significance: ${c.significance}`)
      .join('\n');

    const phasesSummary = phases
      .map((p: any) => {
        const text = p.narration_text || '';
        const preview = text.split(/\s+/).slice(0, 50).join(' ');
        return `Phase ${p.phase_number} (${p.phase_title}): "${preview}..."`;
      })
      .join('\n');

    let prompt = '';
    if (project?.content_profile === 'cinematic_series') {
      const movieConfig = (project as any).movie_config || {};
      const format = movieConfig.format || 'single_movie';
      const genre = movieConfig.genre || 'Cinematic';
      const tone = (movieConfig.tone || []).join(', ') || 'dramatic';
      const season = movieConfig.season_number ?? 1;
      const episode = movieConfig.episode_number ?? 1;

      prompt = `You are a professional Screenplay Publicist and Cinematic Marketing copywriter. Based on the provided video script, generate cinematic metadata (titles, logline, description, and tags) optimized for maximum prestige, engagement, and audience reach.

Write all copy in ${narrationLanguage}. If ${narrationLanguage} is Hindi, use Devanagari.

PROJECT DETAILS:
- Format: ${format}
- Genre: ${genre}
- Tone: ${tone}
- Season Number: ${season}
- Episode Number: ${episode}
- Topic/Seed: ${topic}

PRODUCTION BIBLE DETAILS:
Visual Style: ${bibleData.visual_style_lock?.color_mood || 'N/A'}
Active Characters:
${characterSummary || 'None'}

STORY ANALYSIS SUMMARY:
${storyAnalysisSummary || 'N/A'}

PHASES NARRATION PREVIEWS:
${phasesSummary}

TITLE RULES: Generate exactly 8 title variants.
- For series formats ('episode_series' or 'season_based_series'), format the titles in a series/episode-aware style, e.g.:
  "Series Title - S${season}E${episode}: [Episode Subtitle]"
- For 'single_movie' formats, format the titles as movie titles with sub-headings, e.g.:
  "Movie Title: [Compelling Subtitle]" or similar cinematic titles.
Each title: max 60 characters, no cheap clickbait, no ALL CAPS, sentence/title case.

DESCRIPTION: Write a cinematic description (250–350 words):
1. A strong, dramatic logline (1-2 sentences) at the very top.
2. A compelling narrative synopsis of the episode/film (2 paragraphs, no spoilers).
3. A credit-style production block (Directors/Cast/Credits placeholder) and call to action.
Include the [CHAPTERS] placeholder where the chapter list will be inserted.

CHAPTERS: Generate chapter timestamps using the 10 phase titles. Format: 00:00 Phase Title. Start at 00:00 with ~30s intervals sequentially (e.g. 00:00, 00:30, 01:00, etc.).

TAGS: Generate 20 tags. Include the genre, tone, main character/creature names, and cinematic terms.

HASHTAGS: Generate 5 hashtags (e.g. #[genre], #[character], #[seriesname], etc.).

THUMBNAIL_HOOK: Write a 6-word max text overlay for the poster/thumbnail.

Return ONLY valid JSON in this exact shape:
{
  "titles": [
    { "text": "string", "structure_type": "string", "char_count": 0 }
  ],
  "description": "string",
  "chapters": [
    { "timestamp": "string", "label": "string" }
  ],
  "tags": ["string"],
  "hashtags": ["string"],
  "thumbnail_hook": "string"
}`;
    } else {
      prompt = `You are a YouTube SEO and title optimization expert specializing in viral content. Based on the provided video script, generate YouTube metadata optimized for maximum click-through rate and discoverability.

Write the YouTube title, description, and tags in ${narrationLanguage}. If ${narrationLanguage} is Hindi, use Devanagari (tags may include common English keywords for SEO).

PROJECT TOPIC:
${topic}

PRODUCTION BIBLE DETAILS:
Visual Style Lock Color Mood: ${bibleData.visual_style_lock?.color_mood || 'N/A'}
Visual Style Lock Camera Movement: ${bibleData.visual_style_lock?.camera_movement_style || 'N/A'}
Active Characters:
${characterSummary || 'None'}

STORY ANALYSIS SUMMARY:
${storyAnalysisSummary || 'N/A'}

PHASES NARRATION PREVIEWS:
${phasesSummary}

TITLE RULES: Generate exactly 8 title variants. Use these proven structures (at least one of each):
- Curiosity gap: 'The [X] Nobody Talks About'
- Number list: 'X Things About [topic] That Will [reaction]'
- Challenge/myth bust: 'Why Everything You Know About [X] Is Wrong'
- Stakes/consequence: 'What Happens When [X] — The Truth'
- First person/story: 'I Discovered [X] and It Changed Everything'
- Superlative: 'The Most [adj] [topic] in [context]'
- Question: 'What If [X] Actually [Y]?'
- Direct revelation: 'The Real Reason [X] [happened/works/exists]'

Each title: max 60 characters, no clickbait that cannot be fulfilled, no ALL CAPS words, sentence case.

DESCRIPTION: Write a YouTube description (250–350 words): hook sentence, 2-paragraph summary (no spoilers), call to action. Include [CHAPTERS] placeholder where chapter list will be inserted.

CHAPTERS: Generate chapter timestamps assuming total video duration of (phase_count * avg_phase_duration) or sequential chunks. Assume average phase is around 30 seconds for simplicity. Format: 00:00 Phase Title. Use the 10 phase titles. First chapter always 00:00. List them sequentially starting at 00:00 with ~30s intervals (e.g. 00:00, 00:30, 01:00, etc.).

TAGS: Generate 20 single or short-phrase tags (no #). Mix broad (3–5), niche (10–12), and long-tail (5–7).

HASHTAGS: Generate 5 hashtags for the description footer (#[topic], #[style], 3 others relevant to content).

THUMBNAIL_HOOK: Write a 6-word max text overlay for the thumbnail (e.g. 'They Buried This for Decades').

Return ONLY valid JSON in this exact shape:
{
  "titles": [
    { "text": "string", "structure_type": "string", "char_count": 0 }
  ],
  "description": "string",
  "chapters": [
    { "timestamp": "string", "label": "string" }
  ],
  "tags": ["string"],
  "hashtags": ["string"],
  "thumbnail_hook": "string"
}`;
    }

    return this.generateStructured<VideoMetadataData>(
      projectId,
      apiKey,
      modelName,
      {
        prompt,
        schema: titleMetadataSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      }
    );
  }
}

export const titleMetadataAgent = new TitleMetadataAgent();
