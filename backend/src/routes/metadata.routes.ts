import { Router, Request, Response, NextFunction } from 'express';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { StoryAnalysisRepository } from '../db/repositories/story-analysis.repo';
import { VideoMetadataRepository } from '../db/repositories/metadata.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { titleMetadataAgent } from '../agents/title-metadata-agent';
import { sendSseChunk, sendSseDone, sendSseError, sendSseProgress } from '../utils/sse';
import { titleMetadataSchema } from 'shared';
import { z } from 'zod';
import db from '../db/connection';
import { StructuredOutputError } from '../utils/structured-output.error';

const router = Router();

const updateMetadataSchema = z.object({
  selected_title: z.string().optional(),
  description: z.string().optional(),
  chapters: z.union([z.string(), z.array(z.object({ timestamp: z.string(), label: z.string() }))]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  hashtags: z.union([z.string(), z.array(z.string())]).optional(),
  thumbnail_hook: z.string().max(30).optional(),
});

// GET /api/v1/projects/:id/metadata
router.get('/:id/metadata', (req: Request, res: Response) => {
  const { id } = req.params;
  const metadata = VideoMetadataRepository.findByProjectId(id);
  if (!metadata) {
    res.status(404).json({ success: false, error: 'Video metadata not found', code: 'METADATA_NOT_FOUND' });
    return;
  }
  
  // Format JSON values
  res.json({
    success: true,
    data: {
      ...metadata,
      raw_json: JSON.parse(metadata.raw_json),
      chapters: JSON.parse(metadata.chapters),
      tags: JSON.parse(metadata.tags),
      hashtags: JSON.parse(metadata.hashtags),
    }
  });
});

// POST /api/v1/projects/:id/metadata/generate
router.post('/:id/metadata/generate', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found. Generate it first.', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const phases = ScriptRepository.findPhasesByProjectId(id);
  if (!phases || phases.length === 0) {
    res.status(400).json({ success: false, error: 'Narrative script phases not found. Generate script first.', code: 'SCRIPT_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  res.json({ success: true, message: 'Metadata generation started' });

  // Generate metadata in background and stream logs via SSE
  (async () => {
    const sseAgentName = 'TitleMetadataAgent';
    try {
      sendSseProgress(id, sseAgentName, { current: 1, total: 1, phase: 1, scene: 1 });
      sendSseChunk(id, sseAgentName, 'Gathering script andProduction Bible context...\n');

      const bibleData = JSON.parse(bible.raw_json);
      const storyAnalysis = StoryAnalysisRepository.findByProjectId(id);
      const storyAnalysisSummary = storyAnalysis ? storyAnalysis.summary : null;

      sendSseChunk(id, sseAgentName, 'Calling Gemini to synthesize viral YouTube Titles and Metadata...\n');
      
      const result = await titleMetadataAgent.run(
        id,
        project.topic,
        bibleData,
        phases,
        storyAnalysisSummary,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
      );

      sendSseChunk(id, sseAgentName, 'Saving generated metadata to database...\n');
      VideoMetadataRepository.createOrUpdate(id, result);

      sendSseChunk(id, sseAgentName, '✓ Metadata generated successfully!\n');
      sendSseDone(id, sseAgentName);
    } catch (err: any) {
      console.error('[TitleMetadataAgent] Failed:', err);
      const isStructuredError = err instanceof StructuredOutputError;
      const errMsg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error generating metadata');
      sendSseError(id, sseAgentName, errMsg);
    }
  })().catch((err) => {
    console.error('[TitleMetadataAgent] Unhandled error:', err);
  });
});

// PUT /api/v1/projects/:id/metadata
router.put('/:id/metadata', (req: Request, res: Response) => {
  const { id } = req.params;
  
  const validation = updateMetadataSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: 'Validation failed', details: validation.error.format() });
    return;
  }

  const existing = VideoMetadataRepository.findByProjectId(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Metadata not found', code: 'METADATA_NOT_FOUND' });
    return;
  }

  const updated = VideoMetadataRepository.updateFields(id, req.body);
  if (!updated) {
    res.status(500).json({ success: false, error: 'Failed to update metadata' });
    return;
  }

  res.json({
    success: true,
    data: {
      ...updated,
      raw_json: JSON.parse(updated.raw_json),
      chapters: JSON.parse(updated.chapters),
      tags: JSON.parse(updated.tags),
      hashtags: JSON.parse(updated.hashtags),
    }
  });
});

// POST /api/v1/projects/:id/metadata/regenerate-titles
router.post('/:id/metadata/regenerate-titles', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const existing = VideoMetadataRepository.findByProjectId(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Metadata not found', code: 'METADATA_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing.', code: 'API_KEY_MISSING' });
    return;
  }

  res.json({ success: true, message: 'Title regeneration started' });

  (async () => {
    const sseAgentName = 'TitleMetadataAgent_Titles';
    try {
      sendSseProgress(id, sseAgentName, { current: 1, total: 1, phase: 1, scene: 1 });
      sendSseChunk(id, sseAgentName, 'Regenerating title variants...\n');

      const bible = BibleRepository.findByProjectId(id);
      const bibleData = bible ? JSON.parse(bible.raw_json) : {};
      const phases = ScriptRepository.findPhasesByProjectId(id);
      const storyAnalysis = StoryAnalysisRepository.findByProjectId(id);
      const storyAnalysisSummary = storyAnalysis ? storyAnalysis.summary : null;

      const result = await titleMetadataAgent.run(
        id,
        project.topic,
        bibleData,
        phases,
        storyAnalysisSummary,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
      );

      // Extract only the titles and update the existing raw_json titles
      const currentRawJson = JSON.parse(existing.raw_json);
      currentRawJson.titles = result.titles;

      db.prepare(`
        UPDATE video_metadata
        SET raw_json = ?
        WHERE project_id = ?
      `).run(JSON.stringify(currentRawJson), id);

      sendSseChunk(id, sseAgentName, '✓ Titles regenerated successfully!\n');
      sendSseDone(id, sseAgentName);
    } catch (err: any) {
      console.error('[TitleMetadataAgent] Titles Regeneration failed:', err);
      const isStructuredError = err instanceof StructuredOutputError;
      const errMsg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error regenerating titles');
      sendSseError(id, sseAgentName, errMsg);
    }
  })().catch((err) => {
    console.error('[TitleMetadataAgent] Unhandled error:', err);
  });
});

export default router;
