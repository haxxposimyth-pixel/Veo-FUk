import { Router, Request, Response, NextFunction } from 'express';
import { ProjectRepository } from '../db/repositories/project.repo';
import { SceneRepository } from '../db/repositories/scene.repo';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { BibleRepository } from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { ProjectLockManager } from '../utils/project-lock';
import { checkProjectIntegrity } from '../utils/integrity';
import { veoAgent, assembleVeoFullPrompt, checkAvoidContradiction } from '../agents/veo-agent';
import { continuityAgent } from '../agents/continuity-agent';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { veoPromptAgentOutputSchema, Project, veoPromptCompleteSchema, narrationFitsDuration, MAX_PHASE_COUNT } from 'shared';
import { validateBody } from '../middleware/validate.middleware';
import { sendSseChunk, sendSseDone, sendSseError, sendSseProgress } from '../utils/sse';
import { StructuredOutputError } from '../utils/structured-output.error';
import { validatePrompt } from '../utils/veo-validation';
import { z } from 'zod';
import db from '../db/connection';
import crypto from 'crypto';
import { geminiKeyPool } from '../services/gemini-key-pool';

const router = Router();

export const generatePromptSchema = z.object({
  sceneId: z.string().optional(),
  phaseNumber: z.number().int().min(1).max(MAX_PHASE_COUNT).optional(),
  regenerate: z.boolean().optional(),
});

/**
 * Resolves all IDs in a scene to full text descriptions from the Production Bible,
 * and calls the veoAgent to generate the technical video prompt.
 */
async function runWithConcurrency<T>(
  items: any[],
  limit: number,
  worker: (item: any) => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  let activeCount = 0;
  let queueIndex = 0;

  return new Promise<PromiseSettledResult<T>[]>((resolve) => {
    function next() {
      if (queueIndex >= queue.length && activeCount === 0) {
        resolve(results);
        return;
      }

      while (activeCount < limit && queueIndex < queue.length) {
        const { item, index } = queue[queueIndex++];
        activeCount++;
        worker(item)
          .then((res) => {
            results[index] = { status: 'fulfilled', value: res };
          })
          .catch((err) => {
            results[index] = { status: 'rejected', reason: err };
          })
          .finally(() => {
            activeCount--;
            next();
          });
      }
    }
    next();
  });
}

function runShotDiversityPass(projectId: string, phaseNumber: number): void {
  try {
    const prompts = VeoPromptRepository.findByPhase(projectId, phaseNumber);
    const settings = SettingsRepository.getSettings();
    for (let i = 1; i < prompts.length; i++) {
      const prevData = JSON.parse(prompts[i - 1].raw_json);
      const currData = JSON.parse(prompts[i].raw_json);
      
      if (currData.shot_type === prevData.shot_type && currData.camera === prevData.camera) {
        const warningMsg = `Shot diversity violation at Phase ${phaseNumber} Scene ${prompts[i].scene_number}: shot_type '${currData.shot_type}' and camera '${currData.camera}' repeated consecutively.`;
        console.warn(`[VeoAgent] ${warningMsg}`);
        
        // Log warning to agent_logs
        db.prepare(`
          INSERT INTO agent_logs
            (id, project_id, agent_name, model_used, status, error_message, created_at)
          VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
        `).run(
          crypto.randomUUID(),
          projectId,
          'VeoAgent_Diversity',
          settings.model || 'gemini-2.5-flash-lite',
          warningMsg
        );
      }
    }
  } catch (err: any) {
    console.error(`[VeoAgent] Diversity post-pass failed: ${err.message}`);
  }
}

async function runConnectionReconciliationPass(projectId: string, phaseNumber: number): Promise<void> {
  try {
    const prompts = VeoPromptRepository.findByPhase(projectId, phaseNumber);
    if (prompts.length === 0) return;

    prompts.sort((a, b) => Number(a.prompt_number) - Number(b.prompt_number));

    const settings = SettingsRepository.getSettings();
    const parsedPrompts = prompts.map(p => JSON.parse(p.raw_json));

    for (let i = 0; i < parsedPrompts.length; i++) {
      const prevPrompt = i > 0 ? parsedPrompts[i - 1] : null;
      const currPrompt = parsedPrompts[i];
      const nextPrompt = i < parsedPrompts.length - 1 ? parsedPrompts[i + 1] : null;

      try {
        const result = await veoAgent.reconcileConnections(
          projectId,
          settings.apiKey,
          settings.model,
          prevPrompt,
          currPrompt,
          nextPrompt
        );

        if (result && result.connection_curr) {
          currPrompt.connection = result.connection_curr.trim();
          if (currPrompt.connection && !/[.!?]$/.test(currPrompt.connection)) {
            currPrompt.connection += '.';
          }

          // Re-assemble veo_full_prompt to ensure consistency
          currPrompt.veo_full_prompt = assembleVeoFullPrompt(
            currPrompt,
            Number(currPrompt.prompt_number) || (i + 1),
            currPrompt.title || ''
          );

          // Update in DB using VeoPromptRepository.updateById with full payload
          await VeoPromptRepository.updateById(prompts[i].id, currPrompt);
        }
      } catch (err: any) {
        console.error(`[VeoAgent] Connection reconciliation failed for prompt ${currPrompt.prompt_number} in phase ${phaseNumber}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[VeoAgent] Connection reconciliation pass failed for phase ${phaseNumber}: ${err.message}`);
  }
}

// === VVS OPT FIX-1D START ===
async function generateSinglePrompt(
  projectId: string,
  sceneRow: any,
  bibleData: any,
  settings: any,
  sseAgentName: string,
  onChunk?: (chunk: string) => void,
  projectParam?: any
) {
  const project = projectParam ?? ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');
// === VVS OPT FIX-1D END ===

  const scene = JSON.parse(sceneRow.raw_json);

  // 1. Resolve Location ID
  let locationDescription = scene.location_id;
  const loc = bibleData.location_roster.find((l: any) => l.id === scene.location_id);
  if (loc) {
    locationDescription = `Name: ${loc.name}, Type: ${loc.type}, Atmosphere: ${loc.atmosphere}, Lighting Notes: ${loc.lighting_notes}, Default Time: ${loc.time_of_day_default}, Visual Signature: ${loc.visual_signature}`;
  }

  // 2. Resolve Characters Present
  const charactersPresent = (scene.character_ids_present || []).map((charId: string) => {
    const char = bibleData.character_roster.find((c: any) => c.id === charId);
    return char ? {
      name: char.name,
      role: char.role,
      physical_description: char.physical_description,
      costume_description: char.costume_description,
      voice_tone: char.voice_tone,
      significance: char.significance
    } : { id: charId };
  });

  // 3. Resolve Objects Featured
  const objectsFeatured = (scene.object_ids_featured || []).map((objId: string) => {
    const obj = bibleData.object_registry.find((o: any) => o.id === objId);
    return obj ? {
      name: obj.name,
      description: obj.description,
      symbolic_meaning: obj.symbolic_meaning,
      screen_time: obj.screen_time
    } : { id: objId };
  });

  // Compile fully resolved scene context object for veoAgent
  const resolvedScene = {
    title: scene.title,
    scene_number: scene.scene_number,
    phase_number: sceneRow.phase_number,
    narration_fragment: scene.narration_fragment,
    emotional_beat: scene.emotional_beat,
    scene_description: scene.scene_description,
    continuity_notes: scene.continuity_notes,
    transition_to_next: scene.transition_to_next,
    location_description: locationDescription,
    characters_present: charactersPresent,
    objects_featured: objectsFeatured
  };
  // === VVS OPT FIX-1D START ===
  let promptData = await veoAgent.run(
    resolvedScene,
    project,
    bibleData,
    projectId,
    sceneRow.phase_number,
    sceneRow.scene_number,
    undefined,
    settings.model,
    { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
    onChunk
  );
  // === VVS OPT FIX-1D END ===

  // Save to database
  try {
    promptData.bible_version = bibleData.version || 1;
    VeoPromptRepository.createOrUpdate(
      projectId,
      sceneRow.id,
      sceneRow.phase_number,
      sceneRow.scene_number,
      promptData
    );
  } catch (dbErr: any) {
    console.error(`[VeoAgent] DB INSERT/UPDATE failed for project=${projectId}, phase=${sceneRow.phase_number}, scene=${sceneRow.scene_number}: ${dbErr.message}`);
    throw new Error(`Veo prompt generated but failed to save: ${dbErr.message}`);
  }

  return promptData;
}

// GET /api/v1/projects/:id/prompts
router.get('/:id/prompts', (req: Request, res: Response) => {
  const bible = BibleRepository.findByProjectId(req.params.id);
  const currentVersion = bible ? bible.version : 1;
  const prompts = VeoPromptRepository.findByProjectId(req.params.id);
  const formatted = prompts.map(p => {
    const raw = JSON.parse(p.raw_json);
    const bible_version = raw.bible_version ?? 1;
    const isOutdated = bible_version < currentVersion;
    return {
      ...p,
      raw_json: {
        ...raw,
        bible_outdated: isOutdated
      },
      bible_version,
      bible_outdated: isOutdated
    };
  });
  res.json({ success: true, data: formatted });
});

// GET /api/v1/projects/:id/prompts/timing-audit
router.get('/:id/prompts/timing-audit', (req: Request, res: Response) => {
  res.json({ success: true, count: 0, data: [] });
});


// PUT /api/v1/projects/:id/prompts/:promptId
router.put('/:id/prompts/:promptId', async (req: Request, res: Response) => {
  const { id, promptId } = req.params;
  const existing = VeoPromptRepository.findById(promptId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Veo Prompt not found', code: 'PROMPT_NOT_FOUND' });
    return;
  }

  const { visual, shot, shot_type, lens, lighting, camera, ambient_sound, sfx, avoid, connection, duration_seconds, scene_type, violations: incomingViolations } = req.body;

  // 1. duration_seconds validation
  if (duration_seconds !== undefined) {
    const durVal = Number(duration_seconds);
    if (isNaN(durVal) || !Number.isInteger(durVal) || durVal <= 0) {
      res.status(400).json({ success: false, field: 'duration_seconds', error: 'Duration must be a positive integer.' });
      return;
    }
  }

  // 1. visual length check
  if (!visual || visual.length < 200) {
    res.status(400).json({ success: false, field: 'visual', error: 'Visual field too short — minimum 200 characters.' });
    return;
  }
  let finalVisual = visual;
  if (finalVisual.length > 500) {
    finalVisual = finalVisual.substring(0, 497) + '...';
  }

  // 2. Arabic numerals check
  if (/\d/.test(finalVisual)) {
    res.status(400).json({ success: false, field: 'visual', error: "Visual field contains numerals — use word form (e.g. 'three' not '3')." });
    return;
  }

  // 3. Avoid check not empty
  if (!avoid || avoid.trim().length === 0) {
    res.status(400).json({ success: false, field: 'avoid', error: 'Avoid field must contain at least one exclusion cue.' });
    return;
  }

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  // 4. Forbidden elements in Avoid check
  const bible = BibleRepository.findByProjectId(id);
  const bibleData = bible ? JSON.parse(bible.raw_json) : {};
  const forbidden = bibleData.visual_style_lock?.forbidden_elements || [];
  const missingForbidden = forbidden.filter(
    (f: string) => !avoid.toLowerCase().includes(f.toLowerCase())
  );
  let finalAvoid = avoid;
  if (missingForbidden.length > 0) {
    finalAvoid = finalAvoid ? finalAvoid + ', ' + missingForbidden.join(', ') : missingForbidden.join(', ');
  }

  // Prepare full data block
  const existingData = JSON.parse(existing.raw_json);
  const updatedData = {
    ...existingData,
    visual: finalVisual,
    shot,
    shot_type: shot_type || existingData.shot_type || 'medium',
    lens,
    lighting,
    camera,
    ambient_sound,
    sfx,
    dialogue: "",
    avoid: finalAvoid,
    connection,
    visual_truncated: 0,
    duration_seconds: duration_seconds !== undefined ? Number(duration_seconds) : (existingData.duration_seconds || 8),
    scene_type: scene_type || (existingData.scene_type || 'standard'),
    bible_version: existingData.bible_version ?? bibleData.version ?? 1,
  };

  const { hasContradiction } = checkAvoidContradiction(finalVisual, finalAvoid);
  updatedData.avoid_contradiction = hasContradiction ? 1 : 0;

  // Assemble full prompt
  const sceneRow = SceneRepository.findById(existing.scene_id);
  const sceneTitle = sceneRow ? sceneRow.title : 'Untitled Scene';
  updatedData.veo_full_prompt = assembleVeoFullPrompt(updatedData, existing.prompt_number as number, sceneTitle);

  // Run validation in report-only mode
  let validationResult: any = { violation: false, violations: [] };
  const settings = SettingsRepository.getSettings();
  if (bibleData && settings.apiKey) {
    const parsedScene = sceneRow ? JSON.parse(sceneRow.raw_json) : {};
    const activeCharacterIds = parsedScene.active_character_ids || parsedScene.character_ids_present || [];
    validationResult = await veoAgent.validatePromptFields(
      id,
      updatedData,
      activeCharacterIds,
      bibleData,
      project,
      undefined,
      settings.model
    );
  }

  // Merge fresh violations with incoming/existing dismissed states
  const incomingViolationsArr = incomingViolations || [];
  const existingViolations = existingData.violations || [];

  const freshViolations = (validationResult.violations || []).map((v: any) => {
    const inIncoming = incomingViolationsArr.find((iv: any) => iv.field === v.field && iv.rule === v.rule && iv.dismissed);
    const inExisting = existingViolations.find((ev: any) => ev.field === v.field && ev.rule === v.rule && ev.dismissed);
    const dismissed = !!(inIncoming || inExisting);
    return {
      ...v,
      dismissed
    };
  });

  updatedData.violations = freshViolations;
  const activeViolations = freshViolations.filter((v: any) => !v.dismissed);

  // Set DB columns properly
  updatedData.appearance_violation = activeViolations.length > 0 ? 1 : 0;
  updatedData.appearance_corrected = 0; // manual edits are report-only, never auto-corrected

  const parsedStatus = veoPromptCompleteSchema.safeParse(updatedData).success ? 'done' : 'failed';
  updatedData.status = parsedStatus;

  const updatedPrompt = await VeoPromptRepository.updateById(promptId, updatedData);
  if (!updatedPrompt) {
    res.status(500).json({ success: false, error: 'Failed to update prompt in database.' });
    return;
  }

  res.json({
    success: true,
    message: 'Veo Prompt updated successfully',
    data: {
      prompt: { ...updatedPrompt, raw_json: JSON.parse(updatedPrompt.raw_json) },
      violations: activeViolations
    }
  });
});

// PUT /api/v1/projects/:id/veo-prompts/:promptId
router.put('/:id/veo-prompts/:promptId', validateBody(veoPromptAgentOutputSchema), async (req: Request, res: Response) => {
  const { id, promptId } = req.params;
  const existing = VeoPromptRepository.findById(promptId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Veo Prompt not found', code: 'PROMPT_NOT_FOUND' });
    return;
  }

  const project = ProjectRepository.findById(id);
  const bible = BibleRepository.findByProjectId(id);
  const bibleData = bible ? JSON.parse(bible.raw_json) : {};

  // Force dialogue = "" and preserve/clamp duration_seconds
  const reqData = {
    ...req.body,
    dialogue: "",
    duration_seconds: req.body.duration_seconds !== undefined ? Math.floor(req.body.duration_seconds) : 8,
    scene_type: req.body.scene_type || 'standard'
  };

  const validatedData = validatePrompt(reqData, bibleData, project as Project, existing.scene_number, existing.phase_number) as any;
  const existingData = existing ? JSON.parse(existing.raw_json) : {};
  validatedData.bible_version = existingData.bible_version ?? bibleData.version ?? 1;
  validatedData.visual_truncated = 0;
  const { hasContradiction } = checkAvoidContradiction(validatedData.visual || "", validatedData.avoid || "");
  validatedData.avoid_contradiction = hasContradiction ? 1 : 0;
  const sceneRow = SceneRepository.findById(existing.scene_id);
  const sceneTitle = sceneRow ? sceneRow.title : 'Untitled Scene';
  validatedData.veo_full_prompt = assembleVeoFullPrompt(validatedData as any, existing.prompt_number as number, sceneTitle);

  const parsedStatus = veoPromptCompleteSchema.safeParse(validatedData).success ? 'done' : 'failed';
  validatedData.status = parsedStatus;

  await VeoPromptRepository.updateById(promptId, validatedData);
  res.json({ success: true, message: 'Veo Prompt updated successfully', data: validatedData });
});

// POST /api/v1/projects/:id/prompts/generate
router.post('/:id/prompts/generate', validateBody(generatePromptSchema), (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { sceneId, phaseNumber } = req.body;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  // Guard: Refuse to bulk-generate/phase-generate if there are continuity-stale scenes
  if (!sceneId) {
    if (phaseNumber !== undefined) {
      const staleCount = db.prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ? AND phase_number = ? AND continuity_stale = 1').get(id, phaseNumber) as { count: number };
      if (staleCount && staleCount.count > 0) {
        res.status(400).json({
          success: false,
          error: `Cannot generate prompts because Phase ${phaseNumber} contains continuity-stale scenes. Please repair continuity first.`,
          code: 'CONTINUITY_STALE_ERROR'
        });
        return;
      }
    } else {
      const staleCount = db.prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ? AND continuity_stale = 1').get(id) as { count: number };
      if (staleCount && staleCount.count > 0) {
        res.status(400).json({
          success: false,
          error: 'Cannot bulk-generate prompts because the project contains continuity-stale scenes. Please repair continuity first.',
          code: 'CONTINUITY_STALE_ERROR'
        });
        return;
      }
    }
  }

  const bible = BibleRepository.findByProjectId(id);
  if (!bible) {
    res.status(400).json({ success: false, error: 'Production Bible not found. Generate it first.', code: 'BIBLE_NOT_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  let sseAgentName = 'VeoAgent_Bulk';
  let activePhase: number | 'all' | 'repair' | 'single' = 'all';
  if (sceneId) {
    const sceneRow = SceneRepository.findById(sceneId);
    if (sceneRow) {
      sseAgentName = `VeoAgent_Scene_${sceneRow.phase_number}_${sceneRow.scene_number}`;
      activePhase = sceneRow.phase_number;
    }
  } else if (phaseNumber !== undefined) {
    sseAgentName = `VeoAgent_Phase_${phaseNumber}`;
    activePhase = phaseNumber;
  }

  const lockAcquired = ProjectLockManager.acquireLock(id, activePhase, sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id, activePhase);
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: typeof activePhase === 'number'
        ? `Phase ${activePhase} is already generating prompts.`
        : `Generation is already in progress for this project (Active: ${activeLock?.activePhase}).`
    });
    return;
  }

  res.json({ success: true, message: 'Prompt generation started' });

  // Run in background and stream chunks via SSE
  (async () => {
    const bibleData = JSON.parse(bible.raw_json);

    try {
      if (sceneId) {
        // Individual scene generation
        const sceneRow = SceneRepository.findById(sceneId);
        if (!sceneRow) throw new Error('Scene not found');

        const sseAgentName = `VeoAgent_Scene_${sceneRow.phase_number}_${sceneRow.scene_number}`;
        if (sceneRow.veo_prompt_generated === 1 && !req.body.regenerate) {
          sendSseChunk(id, sseAgentName, `\nSkipping Scene (Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number}): Prompt is already generated.\n`);
          sendSseDone(id, sseAgentName);
          return;
        }

        sendSseProgress(id, sseAgentName, {
          current: 1,
          total: 1,
          phase: sceneRow.phase_number,
          scene: sceneRow.scene_number
        });
        // === VVS OPT FIX-1D START ===
        await generateSinglePrompt(id, sceneRow, bibleData, settings, sseAgentName, (chunk) =>
          sendSseChunk(id, sseAgentName, chunk),
          project
        );
        // === VVS OPT FIX-1D END ===

        sendSseDone(id, sseAgentName);
      } else if (phaseNumber !== undefined) {
        // Phase-level prompt generation
        const scenes = SceneRepository.findByPhase(id, phaseNumber);
        if (scenes.length === 0) throw new Error(`No scenes found for Phase ${phaseNumber}`);

        const sseAgentName = `VeoAgent_Phase_${phaseNumber}`;
        const SCENE_TIMEOUT_MS = 90000;
        
        const scenesToProcess = req.body.regenerate
          ? scenes
          : scenes.filter(s => s.veo_prompt_generated === 0);

        if (scenesToProcess.length === 0) {
          sendSseChunk(id, sseAgentName, `\nAll prompts for Phase ${phaseNumber} are already generated, skipping...\n`);
          sendSseDone(id, sseAgentName);
          return;
        }

        const total = scenesToProcess.length;
        let count = 0;

        const isVertex = settings.vertexEnabled === true;
        let limit = 1;
        if (isVertex) {
          const vertexConcurrency = (settings as any).vertexConcurrency ?? 10;
          limit = Math.max(1, Math.min(25, vertexConcurrency));
        } else {
          const configuredConcurrency = settings.generationConcurrency ?? 5;
          const activeKeys = geminiKeyPool.getStatuses().filter((s: any) => s.status !== 'disabled').length;
          const validKeyCount = activeKeys > 0 ? activeKeys : 1;
          limit = Math.max(1, Math.min(configuredConcurrency, validKeyCount));
        }

        sendSseChunk(id, sseAgentName, `\nGenerating ${total} prompts with concurrency limit of ${limit}...\n`);

        await runWithConcurrency(scenesToProcess, limit, async (sceneRow) => {
          const currentProgress = ++count;
          sendSseProgress(id, sseAgentName, {
            current: currentProgress,
            total,
            phase: sceneRow.phase_number,
            scene: sceneRow.scene_number
          });
          sendSseChunk(id, sseAgentName, `\n--- Generating Prompt for Scene ${currentProgress}/${total} (Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number}) ---\n`);
          try {
            // === VVS OPT FIX-1D START ===
            const promptData = await Promise.race([
              generateSinglePrompt(id, sceneRow, bibleData, settings, sseAgentName, undefined, project),
              new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error(`Scene ${sceneRow.scene_number} timed out after 90s`)), SCENE_TIMEOUT_MS)
              )
            ]);
            // === VVS OPT FIX-1D END ===
            if (promptData.status === 'failed' || promptData.visual_truncated === 1) {
              sendSseChunk(id, sseAgentName, `\n[Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number} Failed: Prompt was incomplete or truncated]\n`);
            }
          } catch (err: any) {
            console.error(`VeoAgent failed for scene ${sceneRow.scene_number}: ${err.message}`);
            // Mark scene as failed in DB
            db.prepare(
              `UPDATE scenes SET veo_prompt_generated = 0 
               WHERE id = ?`
            ).run(sceneRow.id);
            
            sendSseChunk(id, sseAgentName, `\n[Scene ${sceneRow.scene_number} Failed: ${err.message}]\n`);
          }
        });

        // Run diversity post-pass
        runShotDiversityPass(id, phaseNumber);

        // Run connection reconciliation pass
        await runConnectionReconciliationPass(id, phaseNumber);

        sendSseChunk(id, sseAgentName, `\n--- Running Continuity Check for Phase ${phaseNumber} ---\n`);
        try {
          const phasePrompts = VeoPromptRepository.findByPhase(id, phaseNumber).map((p: any) => JSON.parse(p.raw_json));
          const continuityRes = await continuityAgent.run(
            phasePrompts,
            bibleData,
            id,
            undefined,
            settings.model,
            { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
            (chunk) => sendSseChunk(id, sseAgentName, chunk)
          );
          
          const dbPhase = db.prepare('SELECT id FROM phases WHERE project_id = ? AND phase_number = ?').get(id, phaseNumber) as { id: string } | undefined;
          if (dbPhase) {
            ContinuityRepository.deleteByPhase(id, dbPhase.id);
            for (const w of continuityRes.warnings) {
              ContinuityRepository.create({
                project_id: id,
                phase_id: dbPhase.id,
                prompt_number: parseInt(w.prompt_number, 10) || 0,
                field: w.field,
                issue: w.issue,
                suggestion: w.suggestion
              });
            }
          }
        } catch (e: any) {
          console.error("Continuity check failed:", e);
          sendSseChunk(id, sseAgentName, `\n[Continuity Check Failed: ${e.message}]\n`);
        }

        sendSseDone(id, sseAgentName);
      } else {
        // Bulk generation of all missing prompts
        const scenes = SceneRepository.findByProjectId(id);
        const prompts = VeoPromptRepository.findByProjectId(id);
        const existingMap = new Set(
          prompts
            .filter(p => {
              try {
                const parsed = JSON.parse(p.raw_json);
                return parsed.status !== 'failed' && p.visual_truncated !== 1;
              } catch {
                return true;
              }
            })
            .map(p => `${p.phase_number}_${p.scene_number}`)
        );
        const missingScenes = req.body.regenerate
          ? scenes
          : scenes.filter(s => !existingMap.has(`${s.phase_number}_${s.scene_number}`));

        const sseAgentName = `VeoAgent_Bulk`;
        if (missingScenes.length === 0) {
          sendSseChunk(id, sseAgentName, 'All Veo Prompts are already generated!');
          sendSseDone(id, sseAgentName);
          return;
        }

        const SCENE_TIMEOUT_MS = 90000;
        const total = missingScenes.length;
        let count = 0;

        // Group scenes by phase and execute phase by phase (1 to 10)
        const phases = db.prepare('SELECT DISTINCT phase_number FROM scenes WHERE project_id = ? ORDER BY phase_number ASC').all(id) as { phase_number: number }[];

        for (const ph of phases) {
          const phaseNum = ph.phase_number;
          const phaseScenes = missingScenes.filter(s => s.phase_number === phaseNum);

          if (phaseScenes.length > 0) {
            sendSseChunk(id, sseAgentName, `\n--- Starting Phase ${phaseNum} Prompts Generation ---\n`);

            const isVertex = settings.vertexEnabled === true;
            let limit = 1;
            if (isVertex) {
              const vertexConcurrency = (settings as any).vertexConcurrency ?? 10;
              limit = Math.max(1, Math.min(25, vertexConcurrency));
            } else {
              const configuredConcurrency = settings.generationConcurrency ?? 5;
              const activeKeys = geminiKeyPool.getStatuses().filter((s: any) => s.status !== 'disabled').length;
              const validKeyCount = activeKeys > 0 ? activeKeys : 1;
              limit = Math.max(1, Math.min(configuredConcurrency, validKeyCount));
            }

            await runWithConcurrency(phaseScenes, limit, async (sceneRow) => {
              const currentProgress = ++count;
              sendSseProgress(id, sseAgentName, {
                current: currentProgress,
                total,
                phase: sceneRow.phase_number,
                scene: sceneRow.scene_number
              });
              sendSseChunk(id, sseAgentName, `\n--- Generating Prompt ${currentProgress}/${missingScenes.length} (Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number}) ---\n`);
              try {
                // === VVS OPT FIX-1D START ===
                const promptData = await Promise.race([
                  generateSinglePrompt(id, sceneRow, bibleData, settings, sseAgentName, undefined, project),
                  new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error(`Scene ${sceneRow.scene_number} timed out after 90s`)), SCENE_TIMEOUT_MS)
                  )
                ]);
                // === VVS OPT FIX-1D END ===
                if (promptData.status === 'failed' || promptData.visual_truncated === 1) {
                  sendSseChunk(id, sseAgentName, `\n[Phase ${sceneRow.phase_number} Scene ${sceneRow.scene_number} Failed: Prompt was incomplete or truncated]\n`);
                }
              } catch (err: any) {
                console.error(`VeoAgent failed for scene ${sceneRow.scene_number}: ${err.message}`);
                // Mark scene as failed in DB
                db.prepare(
                  `UPDATE scenes SET veo_prompt_generated = 0 
                   WHERE id = ?`
                ).run(sceneRow.id);
                
                sendSseChunk(id, sseAgentName, `\n[Scene ${sceneRow.scene_number} Failed: ${err.message}]\n`);
              }
            });

            // Run diversity post-pass
            runShotDiversityPass(id, phaseNum);

            // Run connection reconciliation pass
            await runConnectionReconciliationPass(id, phaseNum);

            // Run phase-level continuity scan right after this phase's prompts are generated!
            sendSseChunk(id, sseAgentName, `\n--- Running Continuity Scan for Phase ${phaseNum} ---\n`);
            try {
              const phasePrompts = VeoPromptRepository.findByPhase(id, phaseNum).map((p: any) => JSON.parse(p.raw_json));
              const continuityRes = await continuityAgent.run(
                phasePrompts,
                bibleData,
                id,
                undefined,
                settings.model,
                { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
                (chunk) => sendSseChunk(id, sseAgentName, chunk)
              );
              
              const dbPhase = db.prepare('SELECT id FROM phases WHERE project_id = ? AND phase_number = ?').get(id, phaseNum) as { id: string } | undefined;
              if (dbPhase) {
                ContinuityRepository.deleteByPhase(id, dbPhase.id);
                for (const w of continuityRes.warnings) {
                  ContinuityRepository.create({
                    project_id: id,
                    phase_id: dbPhase.id,
                    prompt_number: parseInt(w.prompt_number, 10) || 0,
                    field: w.field,
                    issue: w.issue,
                    suggestion: w.suggestion
                  });
                }
              }
            } catch (e: any) {
              console.error(`Continuity scan failed for Phase ${phaseNum}:`, e);
              sendSseChunk(id, sseAgentName, `\n[Continuity Scan Failed for Phase ${phaseNum}: ${e.message}]\n`);
            }
          }
        }

        // Advance project status to complete ONLY when the integrity verdict is "ready"
        const report = checkProjectIntegrity(id);
        if (report.verdict === 'ready') {
          ProjectRepository.updateStatus(id, 'complete');
        }

        sendSseDone(id, sseAgentName);
      }
    } catch (err: any) {
      const isStructuredError = err instanceof StructuredOutputError;
      const errMsg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error generating Veo prompts');
      sendSseError(id, sseAgentName, errMsg);
    } finally {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[VeoAgent] Unhandled error:', msg);
  });
});

// POST /api/v1/projects/:id/veo-prompts/:promptId/regenerate
router.post('/:id/veo-prompts/:promptId/regenerate', (req: Request, res: Response, next: NextFunction) => {
  const { id, promptId } = req.params;

  const promptRow = VeoPromptRepository.findById(promptId);
  if (!promptRow) {
    res.status(404).json({ success: false, error: 'Veo Prompt not found', code: 'PROMPT_NOT_FOUND' });
    return;
  }

  const sceneRow = SceneRepository.findById(promptRow.scene_id);
  if (!sceneRow) {
    res.status(404).json({ success: false, error: 'Scene context not found', code: 'SCENE_NOT_FOUND' });
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

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key is missing. Configure it in settings first.', code: 'API_KEY_MISSING' });
    return;
  }

  const sseAgentName = `VeoAgent_Regen_${promptRow.prompt_number}`;
  const lockAcquired = ProjectLockManager.acquireLock(id, promptRow.phase_number, sseAgentName);
  if (!lockAcquired) {
    const activeLock = ProjectLockManager.getLock(id, promptRow.phase_number);
    res.status(409).json({
      success: false,
      reason: 'generation_in_progress',
      active_phase: activeLock?.activePhase,
      error: `Phase ${promptRow.phase_number} is already generating prompts.`
    });
    return;
  }

  res.json({ success: true, message: 'Regeneration started' });

  (async () => {
    try {
      const bibleData = JSON.parse(bible.raw_json);

      // === VVS OPT FIX-1D START ===
      await generateSinglePrompt(id, sceneRow, bibleData, settings, sseAgentName, (chunk) =>
        sendSseChunk(id, sseAgentName, chunk),
        project
      );
      // === VVS OPT FIX-1D END ===
      runShotDiversityPass(id, promptRow.phase_number);

      // Run connection reconciliation pass
      await runConnectionReconciliationPass(id, promptRow.phase_number);

      sendSseDone(id, sseAgentName);
    } catch (err: any) {
      const isStructuredError = err instanceof StructuredOutputError;
      const errMsg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err.message || 'Error regenerating Veo prompt');
      sendSseError(id, `VeoAgent_Regen_${promptRow.prompt_number}`, errMsg);
    } finally {
      ProjectLockManager.releaseLockForAgent(id, sseAgentName);
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[VeoAgent] Unhandled error:', msg);
  });
});

export default router;
