import { Router, Request, Response, NextFunction } from 'express';
import { ProjectRepository } from '../db/repositories/project.repo';
import { ScriptRepository } from '../db/repositories/script.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ProjectLockManager } from '../utils/project-lock';
import { checkPredecessorPhases } from '../utils/integrity';
import { sceneAgent } from '../agents/scene-agent';
import { sceneItemSchema, NARRATION_WORDS_PER_SCENE, MAX_PHASE_COUNT } from 'shared';
import { validateBody } from '../middleware/validate.middleware';
import { sendSseChunk, sendSseDone, sendSseError, sendSseProgress, sendSseHeartbeat } from '../utils/sse';
import { StructuredOutputError } from '../utils/structured-output.error';
import { z } from 'zod';
import crypto from 'node:crypto';
import db from '../db/connection';

const router = Router();

export const generateScenesSchema = z.object({
  phaseNumber: z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
  sceneCountTarget: z.number().int().min(12).max(18).optional(),
  regenerate: z.boolean().optional(),
});

// GET /api/v1/projects/:id/scenes
router.get('/:id/scenes', (req: Request, res: Response) => {
  const scenes = SceneRepository.findByProjectId(req.params.id);
  const formatted = scenes.map(s => ({ ...s, raw_json: JSON.parse(s.raw_json) }));
  res.json({ success: true, data: formatted });
});

// GET /api/v1/projects/:id/scenes/:phaseNumber
router.get('/:id/scenes/:phaseNumber', (req: Request, res: Response) => {
  const pNum = parseInt(req.params.phaseNumber, 10);
  const scenes = SceneRepository.findByPhase(req.params.id, pNum);
  const formatted = scenes.map(s => ({ ...s, raw_json: JSON.parse(s.raw_json) }));
  res.json({ success: true, data: formatted });
});

// PUT /api/v1/projects/:id/scenes/:sceneId
router.put('/:id/scenes/:sceneId', validateBody(sceneItemSchema), async (req: Request, res: Response) => {
  const { id, sceneId } = req.params;
  const existing = SceneRepository.findById(sceneId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Scene not found', code: 'SCENE_NOT_FOUND' });
    return;
  }

  const existingData = JSON.parse(existing.raw_json);
  const newDesc = req.body.scene_description;
  const newNarr = req.body.narration_fragment;
  const descChanged = newDesc !== existingData.scene_description || newNarr !== existingData.narration_fragment;

  // Overwrite base fields but preserve existing visual_state_snapshot & continuity_stale initially
  const updateData = {
    ...req.body,
    visual_state_snapshot: existingData.visual_state_snapshot,
    continuity_stale: existingData.continuity_stale || 0,
  };

  SceneRepository.updateScene(sceneId, updateData);

  if (descChanged) {
    try {
      const bible = BibleRepository.findByProjectId(id);
      const bibleData = bible ? JSON.parse(bible.raw_json) : null;
      const settings = SettingsRepository.getSettings();

      if (bibleData && settings.apiKey) {
        // Find preceding scene context
        let previousSnapshot: any = undefined;
        const allScenes = SceneRepository.findByProjectId(id);
        if (existing.scene_number > 1) {
          const prevScene = allScenes.find(s => s.phase_number === existing.phase_number && s.scene_number === existing.scene_number - 1);
          if (prevScene) {
            previousSnapshot = prevScene.visual_state_snapshot ? JSON.parse(prevScene.visual_state_snapshot) : null;
          }
        } else if (existing.phase_number > 1) {
          const prevPhaseScenes = allScenes.filter(s => s.phase_number === existing.phase_number - 1);
          if (prevPhaseScenes.length > 0) {
            const prevScene = prevPhaseScenes[prevPhaseScenes.length - 1];
            previousSnapshot = prevScene.visual_state_snapshot ? JSON.parse(prevScene.visual_state_snapshot) : null;
          }
        }

        const newSnapshot = await sceneAgent.extractSnapshot(
          id,
          newDesc,
          newNarr,
          bibleData,
          undefined,
          settings.model,
          { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
          previousSnapshot
        );

        const reUpdatedScene = {
          ...updateData,
          visual_state_snapshot: newSnapshot,
        };
        SceneRepository.updateScene(sceneId, reUpdatedScene);
      }
    } catch (err: any) {
      console.error('[SceneAgent] Failed to extract snapshot on manual edit:', err);
    }

    // Mark downstream scenes/prompts as stale
    SceneRepository.markDownstreamStale(id, existing.phase_number, existing.scene_number);
  }

  const finalScene = SceneRepository.findById(sceneId)!;
  const formatted = { ...finalScene, raw_json: JSON.parse(finalScene.raw_json) };
  res.json({ success: true, message: 'Scene updated successfully', data: formatted });
});

// POST /api/v1/projects/:id/scenes/generate
router.post('/:id/scenes/generate', validateBody(generateScenesSchema), (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { phaseNumber } = req.body;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  const dbPhases = ScriptRepository.findPhasesByProjectId(id);
  const phasesToRun = phaseNumber ? [phaseNumber] : dbPhases.map(p => p.phase_number);
  
  const sseAgentName = phaseNumber ? `SceneAgent_Phase${phaseNumber}` : `SceneAgent_AllPhases`;
  const lockAcquired = ProjectLockManager.acquireLock(id, phaseNumber ?? 'all', sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id, phaseNumber ?? 'all');
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: phaseNumber !== undefined
        ? `Phase ${phaseNumber} is already generating scenes.`
        : `Generation is already in progress for this project (Active: ${activeLock?.activePhase}).`
    });
    return;
  }

  if (phaseNumber !== undefined && phaseNumber > 1) {
    const ok = checkPredecessorPhases(id, phaseNumber);
    if (!ok) {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
      res.status(409).json({
        success: false,
        reason: 'previous_phase_incomplete',
        error: `Predecessor phases are incomplete. Complete Phase ${phaseNumber - 1} first (continuity chain).`
      });
      return;
    }
  }

  res.json({ success: true, message: 'Scene generation started' });

  // Run in background and stream chunks via SSE
  (async () => {
    const bibleData = JSON.parse(bible.raw_json);

    // Heartbeat: ping the SSE client every 15s so the frontend inactivity watchdog
    // (180s threshold) is continuously reset during silent LLM periods.
    const heartbeatInterval = setInterval(() => {
      sendSseHeartbeat(id, sseAgentName);
    }, 15_000);

    try {
      if (!phaseNumber) {
        sendSseChunk(id, sseAgentName, `\n--- Starting sequential scene generation for all 10 phases ---\n`);
      }

      // === VVS OPT FIX-5 START ===
      // CHANGED FROM: parallel execution with pLimit or Promise.all
      // CHANGED TO: sequential execution to ensure each phase's visual_state_snapshot
      // is complete before the next phase begins (required for continuity chain)

      let allSucceeded = true;
      for (const pNum of phasesToRun) {
        const sseName = phaseNumber ? sseAgentName : `SceneAgent_Phase${pNum}`;
        try {
          const phase = ScriptRepository.findPhaseByNumber(id, pNum);
          if (!phase) throw new Error(`Script phase ${pNum} not found`);

          const existingScenes = SceneRepository.findByPhase(id, pNum);
          if (existingScenes.length > 0 && phase.scenes_generated && !req.body.regenerate) {
            sendSseChunk(id, sseName, `\nSkipping Phase ${pNum}: Scene breakdown is already generated.\n`);
            ScriptRepository.updatePhaseStatus(id, pNum, 'done');
            continue;
          }

          ScriptRepository.updatePhaseStatus(id, pNum, 'processing');

          const narrationText = phase.narration_text ?? phase.phase_content ?? '';
          const wordCount = phase.narration_word_count ?? narrationText.trim().split(/\s+/).filter(Boolean).length;

          const phaseItem = {
            phase_number: phase.phase_number,
            phase_type: phase.phase_type as any,
            phase_title: phase.phase_title,
            phase_content: phase.phase_content,
            narration_text: narrationText,
            narration_word_count: wordCount,
            key_events: [],
            character_ids_active: [],
            location_id_primary: '',
            estimated_duration_seconds: 0,
            viral_hook_rating: 0,
          };

          const sceneData = await sceneAgent.run(
            phaseItem,
            bibleData,
            id,
            pNum,
            0,
            undefined as any,
            undefined,
            { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
            (chunk) => sendSseChunk(id, sseName, chunk),
            project.youtube_transcript
          );

          if (!sceneData?.scenes || sceneData.scenes.length === 0) {
            ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
            throw new Error(`SceneAgent returned 0 scenes for Phase ${pNum}.`);
          }

          // Save to database
          SceneRepository.createOrUpdateBatch(id, phase.id, pNum, sceneData.scenes);
          
          const saved = SceneRepository.findByPhase(id, pNum);
          if (saved.length > 0) {
            // Update scenes generated flag in phase
            ScriptRepository.markPhaseScenesGenerated(id, pNum, true);
            ScriptRepository.updatePhaseStatus(id, pNum, 'done');
            if (!phaseNumber) {
              sendSseChunk(id, sseAgentName, `\n✅ Phase ${pNum} generated successfully.\n`);
            }
          } else {
            ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
            throw new Error(`No scenes saved in DB for Phase ${pNum}.`);
          }
        } catch (error: any) {
          allSucceeded = false;
          ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
          const errMsg = error instanceof Error ? error.message : String(error);
          
          if (!phaseNumber) {
            sendSseChunk(id, sseAgentName, `\n❌ Phase ${pNum} failed: ${errMsg}\n`);
          } else {
            sendSseError(id, sseAgentName, errMsg);
          }

          db.prepare(`
            INSERT INTO agent_logs
              (id, project_id, agent_name, model_used, status, error_message, created_at)
            VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
          `).run(
            crypto.randomUUID(),
            id,
            'SceneAgent',
            settings.model || 'gemini-2.5-flash-lite',
            `Phase ${pNum} failed: ${errMsg}`
          );

          // Stop sequential chain and report the failed phase
          // Do NOT continue to next phase if this phase fails — the continuity chain is broken
          break;
        }
      }
      // === VVS OPT FIX-5 END ===

      if (allSucceeded) {
        // Update project pipeline status to scenes if not already advanced further
        if (project.status === 'script' || project.status === 'bible' || project.status === 'setup') {
          ProjectRepository.updateStatus(id, 'scenes');
        }

        sendSseDone(id, sseAgentName);
      }
    } catch (err: unknown) {
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err instanceof Error ? err.message : String(err));
      console.error('[SceneAgent] Unhandled batch error:', msg);
      sendSseError(id, phaseNumber ? `SceneAgent_Phase${phaseNumber}` : `SceneAgent_AllPhases`, msg);
    } finally {
      clearInterval(heartbeatInterval);
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })();
});

// POST /api/v1/projects/:id/scenes/:sceneId/regenerate
router.post('/:id/scenes/:sceneId/regenerate', (req: Request, res: Response, next: NextFunction) => {
  const { id, sceneId } = req.params;

  const sceneRow = SceneRepository.findById(sceneId);
  if (!sceneRow) {
    res.status(404).json({ success: false, error: 'Scene not found', code: 'SCENE_NOT_FOUND' });
    return;
  }

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const phase = ScriptRepository.findPhaseByNumber(id, sceneRow.phase_number);
  if (!phase) {
    res.status(404).json({ success: false, error: 'Phase script not found', code: 'PHASE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  const sseAgentName = `SceneAgent_Scene${sceneRow.scene_number}`;
  const lockAcquired = ProjectLockManager.acquireLock(id, sceneRow.phase_number, sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id, sceneRow.phase_number);
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: `Phase ${sceneRow.phase_number} is already generating scenes.`
    });
    return;
  }

  res.json({ success: true, message: 'Scene regeneration started' });

  (async () => {
    try {
      const bibleData = JSON.parse(bible.raw_json);
      const currentScene = JSON.parse(sceneRow.raw_json);

      const regenerated = await sceneAgent.regenerateScene(
        id,
        currentScene,
        phase.phase_content,
        bibleData,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => sendSseChunk(id, `SceneAgent_Scene${sceneRow.scene_number}`, chunk)
      );

      // Save to database
      SceneRepository.updateScene(sceneId, regenerated);

      // Reset veo prompt generated flag since visual changes
      SceneRepository.markVeoGenerated(sceneId, false);

      // Mark downstream stale since the visual snapshot of this scene changed
      SceneRepository.markDownstreamStale(id, sceneRow.phase_number, sceneRow.scene_number);

      sendSseDone(id, `SceneAgent_Scene${sceneRow.scene_number}`);
    } catch (err: any) {
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error regenerating scene');
      sendSseError(id, `SceneAgent_Scene${sceneRow.scene_number}`, msg);
    } finally {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SceneAgent] Unhandled error:', msg);
  });
});
// POST /api/v1/projects/:id/phases/:phaseNumber/retry
router.post('/:id/phases/:phaseNumber/retry', (req: Request, res: Response) => {
  const { id, phaseNumber } = req.params;
  const pNum = parseInt(phaseNumber, 10);

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const phase = ScriptRepository.findPhaseByNumber(id, pNum);
  if (!phase) {
    res.status(404).json({ success: false, error: 'Phase not found', code: 'PHASE_NOT_FOUND' });
    return;
  }

  if (phase.status !== 'failed' && phase.status !== 'pending') {
    res.status(400).json({ success: false, error: `Phase status is '${phase.status}', only 'failed' or 'pending' phases can be retried`, code: 'PHASE_NOT_RETRYABLE' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing.', code: 'API_KEY_MISSING' });
    return;
  }

  const sseAgentName = `SceneAgent_Phase${pNum}`;
  const lockAcquired = ProjectLockManager.acquireLock(id, pNum, sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id, pNum);
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: `Phase ${pNum} is already generating scenes.`
    });
    return;
  }

  if (pNum > 1) {
    const ok = checkPredecessorPhases(id, pNum);
    if (!ok) {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
      res.status(409).json({
        success: false,
        reason: 'previous_phase_incomplete',
        error: `Predecessor phases are incomplete. Complete Phase ${pNum - 1} first (continuity chain).`
      });
      return;
    }
  }

  // Reset phase status without deleting existing scenes/prompts
  ScriptRepository.updatePhaseStatus(id, pNum, 'pending');
  ScriptRepository.markPhaseScenesGenerated(id, pNum, false);

  res.json({ success: true, message: 'Phase retry started' });

  // Run in background
  (async () => {
    try {
      ScriptRepository.updatePhaseStatus(id, pNum, 'processing');

      const bibleData = JSON.parse(bible.raw_json);
      const narrationText = phase.narration_text ?? phase.phase_content ?? '';
      const wordCount = phase.narration_word_count ?? narrationText.trim().split(/\s+/).filter(Boolean).length;
      const phaseItem = {
        phase_number: phase.phase_number,
        phase_type: phase.phase_type as any,
        phase_title: phase.phase_title,
        phase_content: phase.phase_content,
        narration_text: narrationText,
        narration_word_count: wordCount,
        key_events: [],
        character_ids_active: [],
        location_id_primary: '',
        estimated_duration_seconds: 0,
        viral_hook_rating: 0,
      };

      const sceneData = await sceneAgent.run(
        phaseItem,
        bibleData,
        id,
        pNum,
        0,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => sendSseChunk(id, `SceneAgent_Phase${pNum}`, chunk),
        project.youtube_transcript
      );

      if (!sceneData?.scenes || sceneData.scenes.length === 0) {
        ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
        throw new Error(`SceneAgent returned 0 scenes for Phase ${pNum}.`);
      }

      SceneRepository.createOrUpdateBatch(id, phase.id, pNum, sceneData.scenes);
      
      const saved = SceneRepository.findByPhase(id, pNum);
      if (saved.length > 0) {
        ScriptRepository.markPhaseScenesGenerated(id, pNum, true);
        ScriptRepository.updatePhaseStatus(id, pNum, 'done');
        sendSseDone(id, `SceneAgent_Phase${pNum}`);
      } else {
        ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
        throw new Error(`No scenes saved in DB for Phase ${pNum}.`);
      }
    } catch (err: any) {
      ScriptRepository.updatePhaseStatus(id, pNum, 'failed');
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error retrying phase');
      sendSseError(id, `SceneAgent_Phase${pNum}`, msg);
    } finally {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SceneAgent] Retry unhandled error:', msg);
  });
});

// POST /api/v1/projects/:id/scenes/repair-continuity
router.post('/:id/scenes/repair-continuity', async (req: Request, res: Response) => {
  const { id } = req.params;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  const allScenes = SceneRepository.findByProjectId(id);
  const staleScenes = allScenes.filter(s => s.continuity_stale === 1);

  if (staleScenes.length === 0) {
    res.json({ success: true, message: 'No stale scenes found.' });
    return;
  }

  const sseAgentName = 'SceneAgent_RepairContinuity';
  const lockAcquired = ProjectLockManager.acquireLock(id, 'repair', sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id);
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: `Generation is already in progress for this project (Active: ${activeLock?.activePhase}).`
    });
    return;
  }

  res.json({ success: true, message: 'Continuity repair started' });

  // Run sequentially in background and stream progress via SSE
  (async () => {
    const sseAgentName = 'SceneAgent_RepairContinuity';
    const total = staleScenes.length;
    let current = 0;

    sendSseChunk(id, sseAgentName, `\n--- Starting Sequential Continuity Repair (Total: ${total} scenes) ---\n`);

    try {
      const bibleData = JSON.parse(bible.raw_json);

      for (const sceneRow of staleScenes) {
        current++;
        sendSseProgress(id, sseAgentName, {
          current,
          total,
          phase: sceneRow.phase_number,
          scene: sceneRow.scene_number
        });

        sendSseChunk(id, sseAgentName, `\nRepairing Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number}...`);

        // Get preceding scene snapshot context
        let previousSnapshot: any = undefined;
        if (sceneRow.scene_number > 1) {
          const prevScene = allScenes.find(s => s.phase_number === sceneRow.phase_number && s.scene_number === sceneRow.scene_number - 1);
          if (prevScene) {
            previousSnapshot = prevScene.visual_state_snapshot ? JSON.parse(prevScene.visual_state_snapshot) : null;
          }
        } else if (sceneRow.phase_number > 1) {
          const prevPhaseScenes = allScenes.filter(s => s.phase_number === sceneRow.phase_number - 1);
          if (prevPhaseScenes.length > 0) {
            const prevScene = prevPhaseScenes[prevPhaseScenes.length - 1];
            previousSnapshot = prevScene.visual_state_snapshot ? JSON.parse(prevScene.visual_state_snapshot) : null;
          }
        }

        const sceneData = JSON.parse(sceneRow.raw_json);

        // Run snapshot extraction
        const snapshot = await sceneAgent.extractSnapshot(
          id,
          sceneData.scene_description,
          sceneData.narration_fragment,
          bibleData,
          undefined,
          settings.model,
          { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
          previousSnapshot
        );

        // Update scene snapshot and reset stale flag
        sceneData.visual_state_snapshot = snapshot;
        sceneData.continuity_stale = 0;

        SceneRepository.updateScene(sceneRow.id, sceneData);

        // Update local memory list so subsequent scenes can reference the new snapshot
        const sIndex = allScenes.findIndex(s => s.id === sceneRow.id);
        if (sIndex !== -1) {
          allScenes[sIndex].visual_state_snapshot = JSON.stringify(snapshot);
          allScenes[sIndex].continuity_stale = 0;
        }

        sendSseChunk(id, sseAgentName, `\n✓ Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number} repaired.\n`);

        // Delay to prevent rate limits
        await new Promise(r => setTimeout(r, 1000));
      }

      sendSseChunk(id, sseAgentName, `\n✅ Continuity repair completed successfully.\n`);
      sendSseDone(id, sseAgentName);
    } catch (err: any) {
      console.error('[SceneAgent_RepairContinuity] Repair error:', err);
      sendSseError(id, sseAgentName, err.message || 'Error repairing continuity');
    } finally {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })();
});

export default router;
