import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ProjectRepository }      from '../db/repositories/project.repo';
import { BibleRepository }        from '../db/repositories/bible.repo';
import { SettingsRepository }     from '../db/repositories/settings.repo';
import { StoryPlanRepository }    from '../db/repositories/storyplan.repo';
import { productionBibleAgent }   from '../agents/production-bible-agent';
import { productionBibleAgentOutputSchema } from 'shared';
import { validateBody }           from '../middleware/validate.middleware';
import { sendSseChunk, sendSseDone, sendSseError } from '../utils/sse';
import { StructuredOutputError } from '../utils/structured-output.error';

const router = Router();

// ─── GET /:id/bible ───────────────────────────────────────────────────────────
router.get('/:id/bible', (req: Request, res: Response) => {
  const bible = BibleRepository.findByProjectId(req.params.id);
  if (!bible) {
    res.status(404).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: JSON.parse(bible.raw_json) });
});

// ─── PUT /:id/bible (manual override) ────────────────────────────────────────
router.put(
  '/:id/bible',
  validateBody(productionBibleAgentOutputSchema),
  (req: Request, res: Response) => {
    const project = ProjectRepository.findById(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }
    const saved = BibleRepository.createOrUpdate(req.params.id, req.body);
    ProjectRepository.updateStatus(req.params.id, 'bible');
    res.json({ success: true, data: JSON.parse(saved.raw_json) });
  },
);

// ─── POST /:id/bible/generate ─────────────────────────────────────────────────
// ─── POST /:id/bible/regenerate ───────────────────────────────────────────────
function handleBibleGeneration(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({
      success: false,
      error:   'Gemini API Key missing — configure it in Settings.',
      code:    'API_KEY_MISSING',
    });
    return;
  }

  // Acknowledge immediately so the client can subscribe to SSE
  res.json({ success: true, message: 'Bible generation started' });

  // Run agent in the background; stream progress via SSE
  void (async () => {
    try {
      let storyPlan: any = null;
      try {
        const plan = StoryPlanRepository.findByProjectId(id);
        if (plan) {
          storyPlan = {
            story_outline: plan.story_outline,
            character_list: plan.character_list,
            location_list: plan.location_list,
            object_list: plan.object_list,
            video_type: plan.video_type,
          };
        }
      } catch (e) {
        // Suppress if no plan exists
      }

      const bibleData = await productionBibleAgent.run(
        project.topic,
        project.visual_style,
        project.narration_language,
        project.aspect_ratio,
        id,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => sendSseChunk(id, 'ProductionBibleAgent', chunk),
        project.youtube_transcript || undefined,
        storyPlan || undefined,
      );

      BibleRepository.createOrUpdate(id, bibleData);
      ProjectRepository.updateStatus(id, 'bible');
      sendSseDone(id, 'ProductionBibleAgent');

    } catch (err: unknown) {
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err instanceof Error ? err.message : 'Bible generation failed');
      console.error('[BibleAgent] Error:', msg);
      sendSseError(id, 'ProductionBibleAgent', msg);
      // NOTE: do NOT call next(err) here — HTTP response already sent
    }
  })();
}

router.post('/:id/bible/generate',   handleBibleGeneration);
router.post('/:id/bible/regenerate', handleBibleGeneration);

router.post('/:id/bible/repair-objects', async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  try {
    const project = ProjectRepository.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }

    const bible = BibleRepository.findByProjectId(id);
    if (!bible) {
      res.status(404).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
      return;
    }

    const settings = SettingsRepository.getSettings();
    if (!settings.apiKey) {
      res.status(401).json({
        success: false,
        error: 'Gemini API Key missing — configure it in Settings.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const bibleData = JSON.parse(bible.raw_json);
    const currentRegistry = bibleData.object_registry || [];

    if (currentRegistry.length < 20) {
      sendSseChunk(id, 'ProductionBibleAgent_ObjectRepair', `Starting object repair... Current registry has ${currentRegistry.length} entries.`);

      const repairOutput = await productionBibleAgent.repairObjectRegistry(
        id,
        undefined,
        settings.model,
        bibleData.character_roster || [],
        bibleData.location_roster || [],
        currentRegistry,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => sendSseChunk(id, 'ProductionBibleAgent_ObjectRepair', chunk)
      );

      // Merge the returned entries with the existing object_registry (deduplicate by name)
      const mergedRegistry = [...currentRegistry];
      const existingNames = new Set(currentRegistry.map((o: any) => (o.name || '').toLowerCase().trim()));
      const addedNames: string[] = [];

      for (const item of repairOutput) {
        const nameClean = (item.name || '').toLowerCase().trim();
        if (nameClean && !existingNames.has(nameClean)) {
          mergedRegistry.push(item);
          existingNames.add(nameClean);
          addedNames.push(item.name);
        }
      }

      bibleData.object_registry = mergedRegistry;

      // Save the merged registry to the production_bibles table
      BibleRepository.createOrUpdate(id, bibleData);

      // Log this repair call to agent_logs
      try {
        const db = require('../db/connection').default;
        const crypto = require('crypto');
        db.prepare(`
          INSERT INTO agent_logs (id, project_id, agent_name, model_used, status, input_prompt, output_response)
          VALUES (?, ?, ?, ?, 'success', ?, ?)
        `).run(
          crypto.randomUUID(),
          id,
          'ProductionBibleAgent_ObjectRepair',
          settings.model || 'gemini-2.5-pro',
          `Objects before repair: ${currentRegistry.length}. Repairing...`,
          `Added ${addedNames.length} objects: ${addedNames.join(', ')}`
        );
      } catch (logErr: any) {
        console.error(`[BibleAgent] Failed to log repair: ${logErr.message}`);
      }

      sendSseChunk(id, 'ProductionBibleAgent_ObjectRepair', `Successfully added ${addedNames.length} new objects.`);
      sendSseDone(id, 'ProductionBibleAgent_ObjectRepair');

      res.json({
        success: true,
        updatedCount: mergedRegistry.length,
        addedNames,
        addedCount: addedNames.length
      });
    } else {
      sendSseChunk(id, 'ProductionBibleAgent_ObjectRepair', `Registry already has ${currentRegistry.length} entries. No repair needed.`);
      sendSseDone(id, 'ProductionBibleAgent_ObjectRepair');

      res.json({
        success: true,
        updatedCount: currentRegistry.length,
        addedNames: [],
        addedCount: 0
      });
    }
  } catch (err: any) {
    console.error('[BibleAgent] Object repair error:', err.message);
    sendSseError(id, 'ProductionBibleAgent_ObjectRepair', err.message);
    res.status(500).json({ success: false, error: err.message || 'Object repair failed' });
  }
});

export default router;
