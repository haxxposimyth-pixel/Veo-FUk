import { Router, Request, Response } from 'express';
import { ProjectRepository } from '../db/repositories/project.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { VideoMetadataRepository } from '../db/repositories/metadata.repo';
import { ExportService, ExportPackage } from '../services/export.service';
import { validateBody } from '../middleware/validate.middleware';
import { z } from 'zod';

const router = Router();

const exportRequestSchema = z.object({
  format: z.enum(['json', 'markdown', 'txt', 'csv']),
  include: z.array(z.string()).optional(),
});

// GET /api/v1/projects/:id/prompts/export
router.get('/:id/prompts/export', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  const prompts = VeoPromptRepository.findByProjectId(id);
  const blocks = prompts.map((p, idx) => {
    let dialogueVal = 'None';
    try {
      const parsed = JSON.parse(p.raw_json || '{}');
      if (parsed.dialogue) {
        dialogueVal = parsed.dialogue;
      }
    } catch (e) {}

    return `Prompt ${idx + 1} :\n` +
           `Visual: ${p.visual || ''}\n` +
           `Lens: ${p.lens || ''}\n` +
           `Lighting: ${p.lighting || ''}\n` +
           `Camera: ${p.camera || ''}\n` +
           `Sound:\n` +
           `  Ambient: ${p.ambient_sound || ''}\n` +
           `  SFX: ${p.sfx || ''}\n` +
           `  Dialogue: ${dialogueVal}\n` +
           `Avoid: ${p.avoid || ''}\n` +
           `Connection: ${p.connection || ''}\n` +
           `Narration: ${p.narration || ''}`;
  });
  const content = blocks.join('\n\n');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const titleSafe = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `viral-video-studio_${titleSafe}_prompts_${dateStr}.txt`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain');
  res.send(content);
});

// POST /api/v1/projects/:id/export
router.post('/:id/export', validateBody(exportRequestSchema), (req: Request, res: Response) => {
  const { id } = req.params;
  const { format, include = ['bible', 'script', 'scenes', 'prompts'] } = req.body;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  const script = ScriptRepository.findByProjectId(id);
  const phases = ScriptRepository.findPhasesByProjectId(id);
  const scenes = SceneRepository.findByProjectId(id);
  const prompts = VeoPromptRepository.findByProjectId(id);
  const metadata = VideoMetadataRepository.findByProjectId(id);

  const hasBible = include.includes('bible');
  const hasScript = include.includes('script');
  const hasScenes = include.includes('scenes');
  const hasPrompts = include.includes('prompts');
  const hasMetadata = include.includes('metadata');

  const pack: ExportPackage = {
    project,
    bible: hasBible ? bible : null,
    script: hasScript ? script : null,
    phases: hasScript ? phases : [],
    scenes: hasScenes ? scenes : [],
    prompts: hasPrompts ? prompts : [],
    metadata: hasMetadata ? metadata : null,
  };

  let content = '';
  let contentType = 'text/plain';
  let ext = 'txt';

  switch (format) {
    case 'json':
      content = ExportService.exportJSON(pack);
      contentType = 'application/json';
      ext = 'json';
      break;
    case 'markdown':
      content = ExportService.exportMarkdown(pack);
      contentType = 'text/markdown';
      ext = 'md';
      break;
    case 'txt':
      content = ExportService.exportTXT(pack);
      contentType = 'text/plain';
      ext = 'txt';
      break;
    case 'csv':
      content = ExportService.exportCSV(pack);
      contentType = 'text/csv';
      ext = 'csv';
      break;
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const titleSafe = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `viral-video-studio_${titleSafe}_${dateStr}.${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', contentType);
  res.send(content);
});

export default router;
