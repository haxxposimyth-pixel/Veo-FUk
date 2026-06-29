import { Router, Request, Response } from 'express';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { ProjectRepository } from '../db/repositories/project.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { continuityAgent } from '../agents/continuity-agent';
import { sseClients } from '../utils/sse';
import db from '../db/connection';
import type { Phase, VeoPromptData } from 'shared';
import { StructuredOutputError } from '../utils/structured-output.error';

const router = Router();

// GET /api/v1/projects/:id/continuity-warnings
router.get('/:id/continuity-warnings', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }
  
  const warnings = ContinuityRepository.findByProject(id);
  res.json({ success: true, data: warnings });
});

// GET /api/v1/projects/:id/phases/:phaseId/continuity-warnings
router.get('/:id/phases/:phaseId/continuity-warnings', (req: Request, res: Response) => {
  const { id, phaseId } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }
  
  const warnings = ContinuityRepository.findByPhase(id, phaseId);
  res.json({ success: true, data: warnings });
});

// PUT /api/v1/projects/:id/continuity-warnings/:warningId/resolve
// PATCH /api/v1/projects/:id/continuity-warnings/:warningId/resolve
const resolveWarning = (req: Request, res: Response) => {
  const { warningId } = req.params;
  const { resolved } = req.body;
  
  if (typeof resolved !== 'boolean') {
    res.status(400).json({ success: false, error: 'resolved field must be boolean' });
    return;
  }

  const warning = ContinuityRepository.getById(warningId);
  if (!warning) {
    res.status(404).json({ success: false, error: 'Warning not found' });
    return;
  }

  ContinuityRepository.resolve(warningId, resolved);
  
  res.json({ success: true, message: 'Warning resolution updated' });
};

router.put('/:id/continuity-warnings/:warningId/resolve', resolveWarning);
router.patch('/:id/continuity-warnings/:warningId/resolve', resolveWarning);

// POST /api/v1/projects/:id/continuity/scan-all
router.post('/:id/continuity/scan-all', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  // Respond immediately with success to let frontend establish SSE
  res.json({ success: true, message: 'Scan-all continuity check initiated' });

  // Run the agent scanning asynchronously in a background promise
  (async () => {
    const sseAgentName = 'continuity-scan-all';
    try {
      const veoPrompts = VeoPromptRepository.findByProjectId(id);
      const bible = BibleRepository.findByProjectId(id);
      if (!bible) {
        throw new Error('Production Bible not found');
      }
      const bibleData = JSON.parse(bible.raw_json);

      const phases = db.prepare('SELECT * FROM phases WHERE project_id = ?').all(id) as Phase[];
      const totalPhases = phases.length || 10;

      // Map prompt number -> phase id
      const promptToPhaseIdMap = new Map<number, string>();
      for (const p of veoPrompts) {
        const matchingPhase = phases.find(ph => ph.phase_number === p.phase_number);
        if (matchingPhase) {
          promptToPhaseIdMap.set(Number(p.prompt_number), matchingPhase.id);
        }
      }

      // Stream progress events per phase
      for (let i = 1; i <= totalPhases; i++) {
        const key = `${id}:${sseAgentName}`;
        const client = sseClients.get(key);
        if (client) {
          client.write(`data: ${JSON.stringify({ type: 'progress', phase: i, total_phases: totalPhases })}\n\n`);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const settings = SettingsRepository.getSettings();

      // Clear existing cross-phase warnings for this project
      ContinuityRepository.deleteCrossPhase(id);

      const promptsData: VeoPromptData[] = veoPrompts.map(p => JSON.parse(p.raw_json));

      const agentRes = await continuityAgent.run(
        promptsData,
        bibleData,
        id,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        undefined,
        true // isCrossPhase
      );

      // Save each returned warning with cross_phase = 1
      for (const w of agentRes.warnings) {
        const promptNum = parseInt(String(w.prompt_number), 10) || 0;
        let phaseId = promptToPhaseIdMap.get(promptNum);
        if (!phaseId && phases.length > 0) {
          phaseId = phases[0].id;
        }
        if (phaseId) {
          ContinuityRepository.create({
            project_id: id,
            phase_id: phaseId,
            prompt_number: promptNum,
            field: w.field,
            issue: w.issue,
            suggestion: w.suggestion,
            cross_phase: 1
          });
        }
      }

      // Send completion event
      const key = `${id}:${sseAgentName}`;
      const client = sseClients.get(key);
      if (client) {
        client.write(`data: ${JSON.stringify({ type: 'complete', warnings_found: agentRes.warnings.length })}\n\n`);
      }

    } catch (err: any) {
      console.error('[scan-all] Continuity check failed:', err);
      const isStructuredError = err instanceof StructuredOutputError;
      const errMsg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Continuity check failed');
      const key = `${id}:${sseAgentName}`;
      const client = sseClients.get(key);
      if (client) {
        client.write(`data: ${JSON.stringify({ type: 'error', data: errMsg })}\n\n`);
      }
    }
  })().catch(err => {
    console.error('[scan-all] Unhandled exception:', err);
  });
});

// POST /api/v1/projects/:id/continuity-warnings/:warningId/fix
router.post('/:id/continuity-warnings/:warningId/fix', async (req: Request, res: Response) => {
  const { id: projectId, warningId } = req.params;

  const project = ProjectRepository.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const warning = ContinuityRepository.getById(warningId);
  if (!warning) {
    res.status(404).json({ success: false, error: 'Warning not found', code: 'WARNING_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(projectId);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  try {
    // 1. Fetch corresponding prompt
    const promptRow = db.prepare('SELECT * FROM veo_prompts WHERE project_id = ? AND prompt_number = ?').get(projectId, String(warning.prompt_number)) as any;
    if (!promptRow) {
      res.status(404).json({ success: false, error: `Veo Prompt ${warning.prompt_number} not found`, code: 'PROMPT_NOT_FOUND' });
      return;
    }

    const sceneRow = SceneRepository.findById(promptRow.scene_id);
    if (!sceneRow) {
      res.status(404).json({ success: false, error: 'Scene not found', code: 'SCENE_NOT_FOUND' });
      return;
    }

    const promptData = JSON.parse(promptRow.raw_json);
    const sceneData = JSON.parse(sceneRow.raw_json);
    const bibleData = JSON.parse(bible.raw_json);

    if (project.content_profile === 'cinematic_series') {
      console.log(`[Continuity Route] Fixing cinematic continuity warning: ${warning.issue}`);
    }

    // 2. Call ContinuityAgent to fix
    const correctedValue = await continuityAgent.fixWarning(
      promptData,
      sceneData,
      bibleData,
      warning,
      undefined,
      settings.model
    );

    if (!correctedValue || correctedValue.trim() === '') {
      throw new Error('Continuity agent returned an empty correction.');
    }

    // 3. Update the prompt data
    promptData[warning.field] = correctedValue;

    // 4. Validate prompt
    const { validatePrompt } = await import('../utils/veo-validation');
    const validatedData = validatePrompt(promptData, bibleData, project as any, promptRow.scene_number, promptRow.phase_number) as any;

    const { checkAvoidContradiction, assembleVeoFullPrompt } = await import('../agents/veo-agent');
    const { hasContradiction } = checkAvoidContradiction(validatedData.visual || "", validatedData.avoid || "");
    validatedData.avoid_contradiction = hasContradiction ? 1 : 0;
    validatedData.veo_full_prompt = assembleVeoFullPrompt(validatedData, promptRow.prompt_number, sceneRow.title);

    // 5. Update in DB (which also handles status calculation)
    const updated = await VeoPromptRepository.updateById(promptRow.id, validatedData);

    // 6. Resolve warning in DB
    ContinuityRepository.resolve(warningId, true);

    res.json({
      success: true,
      message: 'Continuity issue auto-fixed successfully',
      data: {
        prompt: updated ? { ...updated, raw_json: JSON.parse(updated.raw_json) } : validatedData
      }
    });

  } catch (err: any) {
    console.error('[auto-fix] Continuity warning fix failed:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to auto-fix continuity warning'
    });
  }
});

export default router;
