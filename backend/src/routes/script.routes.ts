import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import db from '../db/connection';
import { ProjectRepository }  from '../db/repositories/project.repo';
import { ScriptRepository }   from '../db/repositories/script.repo';
import { BibleRepository }    from '../db/repositories/bible.repo';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { scriptAgent }        from '../agents/script-agent';
import { hookScorerAgent }  from '../agents/hook-scorer-agent';
import { storyAnalyzerAgent } from '../agents/story-analyzer-agent';
import { credibilityReviewerAgent } from '../agents/credibility-reviewer-agent';
import { StoryAnalysisRepository } from '../db/repositories/story-analysis.repo';
import { CredibilityReviewRepository } from '../db/repositories/credibility-review.repo';
import { validateBody }       from '../middleware/validate.middleware';
import { sendSseChunk, sendSseDone, sendSseError, sendSseHookScore, sendSseStoryAnalysisComplete, sendSseHookRewriteStart, sendSseHookRewriteComplete } from '../utils/sse';
import { StructuredOutputError } from '../utils/structured-output.error';
import type { ProductionBibleData, ScriptTone } from 'shared';
import { checkNarrationPurity, buildPhasePlan, resolveContentProfile, getWordCount, resolveLanguageRules } from 'shared';
import { z } from 'zod';

const router = Router();

const approveSchema      = z.object({ approved: z.boolean() });
const updatePhaseSchema  = z.object({ title: z.string().min(1), content: z.string().min(10), narration_text: z.string().optional(), narration_word_count: z.number().int().nonnegative().optional() });

async function runRehookValidation(
  projectId: string,
  phaseNumber: number,
  narrationText: string,
  apiKey: string | undefined,
  modelName: string
) {
  let validated = false;
  let detected_type = '';
  let reason = '';
  let attempts = 0;

  while (attempts < 3) {
    try {
      const result = await scriptAgent.validateRehook(
        projectId,
        narrationText,
        apiKey,
        modelName
      );
      validated = result.validated;
      detected_type = result.detected_type;
      reason = result.reason;
      if (validated) {
        break;
      }
    } catch (e: any) {
      reason = e.message;
    }
    attempts++;
  }

  if (validated) {
    const allowedTypes = ['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt'];
    let finalType: string | null = detected_type ? detected_type.toLowerCase().trim().replace(/['"]/g, '') : null;
    if (finalType && !allowedTypes.includes(finalType)) {
      if (finalType.includes('question')) finalType = 'new_question';
      else if (finalType.includes('revelation')) finalType = 'revelation';
      else if (finalType.includes('stake')) finalType = 'stakes_escalation';
      else if (finalType.includes('pattern')) finalType = 'pattern_interrupt';
      else finalType = null;
    }
    ScriptRepository.updatePhaseRehook(projectId, phaseNumber, 1, finalType);
  } else {
    console.warn(`[RehookValidation] Phase ${phaseNumber} failed re-hook validation: ${reason}`);
    ScriptRepository.updatePhaseRehook(projectId, phaseNumber, 0, null);
  }
}

// ─── GET /:id/script ──────────────────────────────────────────────────────────
router.get('/:id/script', (req: Request, res: Response) => {
  const script = ScriptRepository.findByProjectId(req.params.id);
  if (!script) {
    res.status(404).json({ success: false, error: 'Script not found', code: 'SCRIPT_NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: { ...script, raw_json: JSON.parse(script.raw_json) } });
});

// ─── GET /:id/script/phases ───────────────────────────────────────────────────
router.get('/:id/script/phases', (req: Request, res: Response) => {
  const phases = ScriptRepository.findPhasesByProjectId(req.params.id);
  res.json({ success: true, data: phases });
});

// ─── PUT /:id/script/approve ─────────────────────────────────────────────────
router.put('/:id/script/approve', validateBody(approveSchema), (req: Request, res: Response) => {
  const script = ScriptRepository.findByProjectId(req.params.id);
  if (!script) {
    res.status(404).json({ success: false, error: 'Script not found', code: 'SCRIPT_NOT_FOUND' });
    return;
  }

  if (req.body.approved) {
    const phase1 = ScriptRepository.findPhaseByNumber(req.params.id, 1);
    if (!phase1 || (phase1.hook_score_passed !== 1 && phase1.hook_score_borderline !== 1)) {
      res.status(400).json({
        success: false,
        error: "Phase 1 hook score has not passed the minimum threshold (6.5). Score or regenerate Phase 1 before approving.",
        code: "HOOK_SCORE_NOT_PASSED"
      });
      return;
    }

    const phases = ScriptRepository.findPhasesByProjectId(req.params.id);
    const tooShortPhases = phases.filter(p => {
      const minWc = p.phase_number === 1 ? 10 : 20;
      const wc = p.narration_word_count ?? 0;
      return wc < minWc;
    });
    if (tooShortPhases.length > 0) {
      const shortNums = tooShortPhases.map(p => p.phase_number).join(', ');
      res.status(400).json({
        success: false,
        error: `Phases [${shortNums}] have narration under the minimum word count (10 for Phase 1, 20 for others) and will produce too few scenes.`,
        code: "WORD_COUNT_MINIMUM_FAILED"
      });
      return;
    }

    const missingRehooks = phases.filter(p => p.rehook_required === 1 && p.rehook_validated !== 1);
    if (missingRehooks.length > 0) {
      const missingPhaseNums = missingRehooks.map(p => p.phase_number).join(', ');
      res.status(400).json({
        success: false,
        error: `Phases [${missingPhaseNums}] require a validated re-hook beat before the script can be approved. Regenerate the flagged phases.`,
        code: "REHOOK_VALIDATION_FAILED"
      });
      return;
    }

    const seenTitles = new Map<string, string>();
    let duplicateTitle: string | null = null;
    for (const p of phases) {
      const title = (p.phase_title || '').trim();
      const lower = title.toLowerCase();
      if (seenTitles.has(lower)) {
        duplicateTitle = seenTitles.get(lower)!;
        break;
      }
      seenTitles.set(lower, title);
    }
    if (duplicateTitle) {
      res.status(400).json({
        success: false,
        error: `Duplicate phase titles detected: '${duplicateTitle}' appears more than once. All phase titles must be unique. Edit the flagged phases before approving.`,
        code: "DUPLICATE_PHASE_TITLES"
      });
      return;
    }
  }

  const warnings: string[] = [];
  if (req.body.approved) {
    const project = ProjectRepository.findById(req.params.id);
    const bibleRow = BibleRepository.findByProjectId(req.params.id);
    const phases = ScriptRepository.findPhasesByProjectId(req.params.id);
    if (project && phases.length > 0) {
      const bibleData = bibleRow ? (bibleRow.raw_json ? JSON.parse(bibleRow.raw_json) : {}) : {};
      const BRAND_WHITELIST = ['STING', 'VVS', 'Veo', 'Google', 'Gemini'];
      const charNames = (bibleData.character_roster || []).map((c: any) => c.name).filter(Boolean);
      const allowedTokens = [...BRAND_WHITELIST, ...charNames];

      for (const p of phases) {
        if (p.narration_text) {
          const purity = checkNarrationPurity(p.narration_text, project.narration_language || 'English', { allowedTokens });
          if (!purity.ok) {
            warnings.push(`Phase ${p.phase_number} narration: possible foreign-script words — ${purity.foreignWords.join(', ')}`);
          }
        }
      }
    }

    const credibilityReview = CredibilityReviewRepository.findByProjectId(req.params.id);
    if (credibilityReview) {
      const reviewData = JSON.parse(credibilityReview.raw_json);
      
      // OPTIONAL BLOCKER (Advisory by default, uncomment to enable hard blocker):
      // if (reviewData.overall_credibility_score < 4 && reviewData.issues.some((i: any) => i.severity === 'high')) {
      //   res.status(400).json({
      //     success: false,
      //     error: `Script credibility review score is too low (${reviewData.overall_credibility_score}/10) with high severity issues. Fix credibility problems before approving.`,
      //     code: "CREDIBILITY_SCORE_TOO_LOW"
      //   });
      //   return;
      // }

      if (reviewData.issues && reviewData.issues.length > 0) {
        for (const issue of reviewData.issues) {
          warnings.push(`Phase ${issue.phase_number} Credibility (${issue.severity} severity): "${issue.claim}" - ${issue.explanation}`);
        }
      }
    }
  }

  ScriptRepository.approve(req.params.id, req.body.approved);
  ProjectRepository.updateStatus(req.params.id, 'script');
  res.json({ success: true, data: { approved: req.body.approved }, warnings });
});

// ─── PUT /:id/script/phases/:phaseNumber ──────────────────────────────────────
router.put(
  '/:id/script/phases/:phaseNumber',
  validateBody(updatePhaseSchema),
  async (req: Request, res: Response) => {
    const { id, phaseNumber } = req.params;
    const pNum  = parseInt(phaseNumber, 10);
    const phase = ScriptRepository.findPhaseByNumber(id, pNum);
    if (!phase) {
      res.status(404).json({ success: false, error: 'Phase not found', code: 'PHASE_NOT_FOUND' });
      return;
    }
    ScriptRepository.updatePhase(id, pNum, req.body.title, req.body.content, req.body.narration_text, req.body.narration_word_count);

    const project = ProjectRepository.findById(id);
    const profile = resolveContentProfile(project?.content_profile || 'viral_story');
    const plan = buildPhasePlan(project?.target_duration_minutes ?? 8, profile);

    // Re-hook validation for phases
    if (plan.rehookPhases.includes(pNum)) {
      const settings = SettingsRepository.getSettings();
      if (settings.apiKey) {
        try {
          const textForValidation = req.body.narration_text || req.body.content || '';
          await runRehookValidation(id, pNum, textForValidation, undefined, settings.model);
        } catch (valErr: any) {
          console.error(`[RehookValidation] Error validating phase ${pNum} during PUT update:`, valErr);
        }
      }
    }

    // Auto-score Phase 1 hook quality
    if (pNum === 1) {
      const settings = SettingsRepository.getSettings();
      if (settings.apiKey) {
        try {
          const finalNarrationText = req.body.narration_text || req.body.content || '';
          const scoreResult = await hookScorerAgent.run(
            id,
            finalNarrationText,
            undefined,
            settings.model,
            { temperature: 0.1, scoringObjective: profile.scoringObjective }
          );

          const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
          const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
          ScriptRepository.updatePhaseHookScore(
            id,
            1,
            scoreResult.overall,
            JSON.stringify(scoreResult),
            passed,
            borderline
          );
        } catch (scoreErr: any) {
          console.error('[HookScorerAgent] Error scoring hook during PUT update:', scoreErr);
        }
      }
    }

    res.json({ success: true, message: 'Phase updated' });
  },
);

// ─── POST /:id/script/generate ───────────────────────────────────────────────
router.post('/:id/script/generate', (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const bibleRow = BibleRepository.findByProjectId(id);
  if (!bibleRow) {
    res.status(400).json({
      success: false,
      error:   'Production Bible not found — generate it first.',
      code:    'BIBLE_NOT_FOUND',
    });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
    return;
  }

  res.json({ success: true, message: 'Script generation started' });

  void (async () => {
    try {
      const bibleData = JSON.parse(bibleRow.raw_json) as ProductionBibleData;

      const { scriptTone: rawScriptTone } = req.body;
      const scriptTone: ScriptTone = {
        pacing: typeof rawScriptTone?.pacing === 'number' ? rawScriptTone.pacing : 5,
        emotional_intensity: typeof rawScriptTone?.emotional_intensity === 'number' ? rawScriptTone.emotional_intensity : 5,
        narration_style: typeof rawScriptTone?.narration_style === 'number' ? rawScriptTone.narration_style : 5,
        target_audience: rawScriptTone?.target_audience || 'auto',
        hook_regenerate: rawScriptTone?.hook_regenerate || 'auto',
        pre_climax_spike: rawScriptTone?.pre_climax_spike || 'auto',
        long_open_loop: rawScriptTone?.long_open_loop || 'auto',
      };

      const scriptData = await scriptAgent.run(
        project.topic,
        bibleData,
        id,
        undefined,
        settings.model,
        {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxTokens,
          target_duration_minutes: project.target_duration_minutes ?? 8
        },
        (chunk) => sendSseChunk(id, 'ScriptAgent', chunk),
        project.youtube_transcript,
        scriptTone
      );

      ScriptRepository.createOrUpdate(id, scriptData);
      ProjectRepository.updateStatus(id, 'script');

      // Re-hook validation for phases
      const profile = resolveContentProfile(project.content_profile || 'viral_story');
      const plan = buildPhasePlan(project.target_duration_minutes ?? 8, profile);
      sendSseChunk(id, 'ScriptAgent', '\n--- Validating Mid-Video Re-hooks ---\n');
      for (const phaseNumber of plan.rehookPhases) {
        const phase = scriptData.phases.find(p => p.phase_number === phaseNumber);
        if (phase) {
          try {
            await runRehookValidation(id, phaseNumber, phase.narration_text || phase.phase_content || '', undefined, settings.model);
          } catch (valErr: any) {
            console.error(`[RehookValidation] Error validating phase ${phaseNumber}:`, valErr);
          }
        }
      }

      // Auto-score Phase 1 hook quality
      const phase1 = scriptData.phases.find((p) => p.phase_number === 1);
      if (phase1 && phase1.narration_text) {
        sendSseChunk(id, 'ScriptAgent', '\n--- Scoring Phase 1 Hook Quality ---\n');
        try {
          const scoreResult = await hookScorerAgent.run(
            id,
            phase1.narration_text,
            undefined,
            settings.model,
            { temperature: 0.1, scoringObjective: profile.scoringObjective }
          );

          const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
          const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
          ScriptRepository.updatePhaseHookScore(
            id,
            1,
            scoreResult.overall,
            JSON.stringify(scoreResult),
            passed,
            borderline
          );

          sendSseHookScore(id, 'ScriptAgent', scoreResult.overall, scoreResult.overall >= profile.hookThreshold, scoreResult.feedback);
        } catch (scoreErr: any) {
          console.error('[HookScorerAgent] Error scoring hook:', scoreErr);
          sendSseChunk(id, 'ScriptAgent', `\n[Warning] Hook scoring failed: ${scoreErr.message}\n`);
        }
      }

      // Automatically invoke StoryAnalyzerAgent and CredibilityReviewerAgent in parallel
      sendSseChunk(id, 'ScriptAgent', '\n--- Running Story Arc Pacing, Retention & Credibility Analysis ---\n');
      try {
        const generatedPhases = ScriptRepository.findPhasesByProjectId(id);
        const narrationPhases = generatedPhases.map(p => ({
          phase_number: p.phase_number,
          phase_title: p.phase_title,
          narration_text: p.narration_text || p.phase_content
        }));

        const project = ProjectRepository.findById(id) || { topic: '', content_type: 'auto', narration_language: 'English' };

        const [analysisData, credibilityData] = await Promise.all([
          storyAnalyzerAgent.analyze(
            id,
            narrationPhases,
            undefined,
            settings.model,
            { temperature: 0.2, scoringObjective: profile.scoringObjective }
          ),
          credibilityReviewerAgent.analyze(
            id,
            narrationPhases,
            {
              topic: project.topic,
              content_type: project.content_type || 'auto',
              narration_language: project.narration_language || 'English'
            },
            undefined,
            settings.model,
            { temperature: 0.1 }
          )
        ]);

        StoryAnalysisRepository.createOrUpdate(id, analysisData);
        CredibilityReviewRepository.createOrUpdate(id, credibilityData);

        sendSseStoryAnalysisComplete(
          id,
          'ScriptAgent',
          analysisData.overall_retention_score,
          analysisData.dropout_risk_phases,
          analysisData.peak_moment_phase
        );
      } catch (analysisErr: any) {
        console.error('[Post-Generation Critics] Error analyzing script:', analysisErr);
        sendSseChunk(id, 'ScriptAgent', `\n[Warning] Script post-generation analysis failed: ${analysisErr.message}\n`);
      }

      sendSseDone(id, 'ScriptAgent');

    } catch (err: unknown) {
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err instanceof Error ? err.message : 'Script generation failed');
      console.error('[ScriptAgent] Error:', msg);
      sendSseError(id, 'ScriptAgent', msg);
      // NOTE: do NOT call next(err) here — HTTP response already sent
    }
  })();
});

// ─── POST /:id/script/phases/:phaseNumber/regenerate ─────────────────────────
router.post(
  '/:id/script/phases/:phaseNumber/regenerate',
  (req: Request, res: Response, next: NextFunction) => {
    const { id, phaseNumber } = req.params;
    const pNum = parseInt(phaseNumber, 10);

    const project = ProjectRepository.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }

    const bibleRow = BibleRepository.findByProjectId(id);
    if (!bibleRow) {
      res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
      return;
    }

    const phase = ScriptRepository.findPhaseByNumber(id, pNum);
    if (!phase) {
      res.status(404).json({ success: false, error: 'Phase not found', code: 'PHASE_NOT_FOUND' });
      return;
    }

    const settings = SettingsRepository.getSettings();
    if (!settings.apiKey) {
      res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
      return;
    }

    const sseAgent = `ScriptAgent_Phase${pNum}`;
    res.json({ success: true, message: `Phase ${pNum} regeneration started` });

    void (async () => {
      try {
        const bibleData  = JSON.parse(bibleRow.raw_json) as ProductionBibleData;
        const allPhases  = ScriptRepository.findPhasesByProjectId(id);
        const { scriptTone: rawScriptTone } = req.body;
        const scriptTone: ScriptTone = {
          pacing: typeof rawScriptTone?.pacing === 'number' ? rawScriptTone.pacing : 5,
          emotional_intensity: typeof rawScriptTone?.emotional_intensity === 'number' ? rawScriptTone.emotional_intensity : 5,
          narration_style: typeof rawScriptTone?.narration_style === 'number' ? rawScriptTone.narration_style : 5,
          target_audience: rawScriptTone?.target_audience || 'auto',
          hook_regenerate: rawScriptTone?.hook_regenerate || 'auto',
          pre_climax_spike: rawScriptTone?.pre_climax_spike || 'auto',
          long_open_loop: rawScriptTone?.long_open_loop || 'auto',
        };

        const regenerated = await scriptAgent.regeneratePhase(
          id,
          pNum,
          phase.phase_title,
          phase.phase_content,
          project.topic,
          bibleData,
          undefined,
          settings.model,
          { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
          (chunk) => sendSseChunk(id, sseAgent, chunk),
          undefined, // feedback parameter
          allPhases,
          scriptTone
        );

        ScriptRepository.updatePhase(id, pNum, regenerated.phase_title, regenerated.phase_content, regenerated.narration_text);
        ScriptRepository.markPhaseScenesGenerated(id, pNum, false);

        const profile = resolveContentProfile(project.content_profile || 'viral_story');
        const plan = buildPhasePlan(project.target_duration_minutes ?? 8, profile);

        if (plan.rehookPhases.includes(pNum)) {
          sendSseChunk(id, sseAgent, `\n--- Validating Phase ${pNum} Re-hook ---\n`);
          try {
            await runRehookValidation(id, pNum, regenerated.narration_text || regenerated.phase_content || '', undefined, settings.model);
          } catch (valErr: any) {
            console.error(`[RehookValidation] Error validating phase ${pNum}:`, valErr);
          }
        }

        if (pNum === 1) {
          sendSseChunk(id, sseAgent, '\n--- Scoring Phase 1 Hook Quality ---\n');
          try {
            const finalNarrationText = regenerated.narration_text || regenerated.phase_content;
            const scoreResult = await hookScorerAgent.run(
              id,
              finalNarrationText,
              undefined,
              settings.model,
              { temperature: 0.1, scoringObjective: profile.scoringObjective }
            );

            const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
            const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
            ScriptRepository.updatePhaseHookScore(
              id,
              1,
              scoreResult.overall,
              JSON.stringify(scoreResult),
              passed,
              borderline
            );

            sendSseHookScore(id, sseAgent, scoreResult.overall, scoreResult.overall >= profile.hookThreshold, scoreResult.feedback);
          } catch (scoreErr: any) {
            console.error('[HookScorerAgent] Error scoring hook:', scoreErr);
            sendSseChunk(id, sseAgent, `\n[Warning] Hook scoring failed: ${scoreErr.message}\n`);
          }
        }

        sendSseDone(id, sseAgent);

      } catch (err: unknown) {
        const isStructuredError = err instanceof StructuredOutputError;
        const msg = isStructuredError
          ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
          : (err instanceof Error ? err.message : 'Phase regeneration failed');
        console.error(`[ScriptAgent] Phase ${pNum} error:`, msg);
        sendSseError(id, sseAgent, msg);
        // NOTE: do NOT call next(err) here — HTTP response already sent
      }
    })();
  },
);

// ─── POST /:id/script/phases/1/regenerate-with-suggestions ─────────────────
router.post(
  '/:id/script/phases/1/regenerate-with-suggestions',
  (req: Request, res: Response) => {
    const { id } = req.params;

    const project = ProjectRepository.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }

    const bibleRow = BibleRepository.findByProjectId(id);
    if (!bibleRow) {
      res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
      return;
    }

    const phase1 = ScriptRepository.findPhaseByNumber(id, 1);
    if (!phase1) {
      res.status(404).json({ success: false, error: 'Phase 1 not found', code: 'PHASE_NOT_FOUND' });
      return;
    }

    if (!phase1.hook_score_breakdown) {
      res.status(400).json({ success: false, error: 'No hook quality scorer feedback available for rewrite.', code: 'NO_FEEDBACK_AVAILABLE' });
      return;
    }

    const settings = SettingsRepository.getSettings();
    if (!settings.apiKey) {
      res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
      return;
    }

    const sseAgent = 'ScriptAgent';
    res.json({ success: true, message: 'Phase 1 hook rewrite started' });

    void (async () => {
      try {
        sendSseHookRewriteStart(id, sseAgent);
        sendSseChunk(id, sseAgent, '\n--- Starting Hook Rewrite with AI Suggestions ---\n');

        const bibleData = JSON.parse(bibleRow.raw_json) as ProductionBibleData;
        const phase2 = ScriptRepository.findPhaseByNumber(id, 2);
        const phase2Text = phase2 ? (phase2.narration_text || phase2.phase_content || '') : '';
        const breakdownStr = phase1.hook_score_breakdown;
        if (!breakdownStr) {
          throw new Error('No hook score breakdown available');
        }
        const hookScoreBreakdown = JSON.parse(breakdownStr);

        const { scriptTone: rawScriptTone } = req.body;
        const scriptTone: ScriptTone = {
          pacing: typeof rawScriptTone?.pacing === 'number' ? rawScriptTone.pacing : 5,
          emotional_intensity: typeof rawScriptTone?.emotional_intensity === 'number' ? rawScriptTone.emotional_intensity : 5,
          narration_style: typeof rawScriptTone?.narration_style === 'number' ? rawScriptTone.narration_style : 5,
          target_audience: rawScriptTone?.target_audience || 'auto',
          hook_regenerate: rawScriptTone?.hook_regenerate || 'auto',
          pre_climax_spike: rawScriptTone?.pre_climax_spike || 'auto',
          long_open_loop: rawScriptTone?.long_open_loop || 'auto',
        };

        const rewrittenNarration = await scriptAgent.rewriteHookWithSuggestions(
          id,
          phase1.narration_text || phase1.phase_content || '',
          hookScoreBreakdown,
          bibleData,
          phase2Text,
          undefined,
          settings.model,
          { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
          (chunk) => sendSseChunk(id, sseAgent, chunk),
          scriptTone
        );

        const newWordCount = rewrittenNarration.trim().split(/\s+/).filter(Boolean).length;

        ScriptRepository.updatePhase(id, 1, phase1.phase_title, rewrittenNarration, rewrittenNarration, newWordCount);
        ScriptRepository.markPhaseScenesGenerated(id, 1, false);

        sendSseHookRewriteComplete(id, sseAgent, newWordCount);

        sendSseChunk(id, sseAgent, '\n--- Re-scoring Rewrite Hook Quality ---\n');
        const profile = resolveContentProfile(project.content_profile || 'viral_story');
        const scoreResult = await hookScorerAgent.run(
          id,
          rewrittenNarration,
          undefined,
          settings.model,
          { temperature: 0.1, scoringObjective: profile.scoringObjective }
        );

        const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
        const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
        ScriptRepository.updatePhaseHookScore(
          id,
          1,
          scoreResult.overall,
          JSON.stringify(scoreResult),
          passed,
          borderline
        );

        sendSseHookScore(id, sseAgent, scoreResult.overall, scoreResult.overall >= profile.hookThreshold, scoreResult.feedback);
        sendSseDone(id, sseAgent);

      } catch (err: unknown) {
        const isStructuredError = err instanceof StructuredOutputError;
        const msg = isStructuredError
          ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
          : (err instanceof Error ? err.message : 'Hook rewrite failed');
        console.error('[ScriptAgent] Hook rewrite error:', msg);
        sendSseError(id, sseAgent, msg);
      }
    })();
  },
);

// ─── GET /:id/script/phases/1/hook-score ─────────────────────────────────────
router.get('/:id/script/phases/1/hook-score', async (req: Request, res: Response) => {
  const { id } = req.params;
  const rescore = req.query.rescore === 'true';

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  let phase = ScriptRepository.findPhaseByNumber(id, 1);
  if (!phase) {
    res.status(404).json({ success: false, error: 'Phase 1 not found', code: 'PHASE_NOT_FOUND' });
    return;
  }

  if (rescore || phase.hook_score === null || phase.hook_score === undefined) {
    const settings = SettingsRepository.getSettings();
    if (!settings.apiKey) {
      res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
      return;
    }

    const narrationText = phase.narration_text || phase.phase_content;
    try {
      const profile = resolveContentProfile(project.content_profile || 'viral_story');
      const scoreResult = await hookScorerAgent.run(
        id,
        narrationText,
        undefined,
        settings.model,
        { temperature: 0.1, scoringObjective: profile.scoringObjective }
      );

      const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
      const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
      ScriptRepository.updatePhaseHookScore(
        id,
        1,
        scoreResult.overall,
        JSON.stringify(scoreResult),
        passed,
        borderline
      );

      phase = ScriptRepository.findPhaseByNumber(id, 1)!;
    } catch (err: any) {
      res.status(500).json({ success: false, error: `Hook scoring failed: ${err.message}` });
      return;
    }
  }

  res.json({
    success: true,
    data: {
      hook_score: phase.hook_score,
      hook_score_breakdown: phase.hook_score_breakdown ? JSON.parse(phase.hook_score_breakdown) : null,
      hook_score_passed: phase.hook_score_passed,
      hook_score_borderline: phase.hook_score_borderline
    }
  });
});

// ─── GET /:id/story-analysis ──────────────────────────────────────────────────
router.get('/:id/story-analysis', (req: Request, res: Response) => {
  const analysis = StoryAnalysisRepository.findByProjectId(req.params.id);
  if (!analysis) {
    res.status(404).json({ success: false, error: 'Story analysis not found', code: 'ANALYSIS_NOT_FOUND' });
    return;
  }
  const parsedRaw = JSON.parse(analysis.raw_json);
  res.json({
    success: true,
    data: {
      ...analysis,
      ...parsedRaw,
      dropout_risk_phases: JSON.parse(analysis.dropout_risk_phases)
    }
  });
});

// ─── POST /:id/story-analysis/generate ────────────────────────────────────────
router.post('/:id/story-analysis/generate', (req: Request, res: Response) => {
  const { id } = req.params;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const generatedPhases = ScriptRepository.findPhasesByProjectId(id);
  if (generatedPhases.length === 0) {
    res.status(400).json({ success: false, error: 'No phases generated yet.', code: 'NO_PHASES_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
    return;
  }

  const sseAgent = 'StoryAnalyzerAgent';
  res.json({ success: true, message: 'Story retention and credibility analysis started' });

  void (async () => {
    try {
      sendSseChunk(id, sseAgent, '\n--- Starting Story Arc Pacing, Retention & Credibility Analysis ---\n');

      const narrationPhases = generatedPhases.map(p => ({
        phase_number: p.phase_number,
        phase_title: p.phase_title,
        narration_text: p.narration_text || p.phase_content
      }));

      const profile = resolveContentProfile(project.content_profile || 'viral_story');
      const [analysisData, credibilityData] = await Promise.all([
        storyAnalyzerAgent.analyze(
          id,
          narrationPhases,
          undefined,
          settings.model,
          { temperature: 0.2, scoringObjective: profile.scoringObjective },
          (chunk) => sendSseChunk(id, sseAgent, chunk)
        ),
        credibilityReviewerAgent.analyze(
          id,
          narrationPhases,
          {
            topic: project.topic,
            content_type: project.content_type || 'auto',
            narration_language: project.narration_language || 'English'
          },
          undefined,
          settings.model,
          { temperature: 0.1 }
        )
      ]);

      StoryAnalysisRepository.createOrUpdate(id, analysisData);
      CredibilityReviewRepository.createOrUpdate(id, credibilityData);

      sendSseStoryAnalysisComplete(
        id,
        sseAgent,
        analysisData.overall_retention_score,
        analysisData.dropout_risk_phases,
        analysisData.peak_moment_phase
      );

      sendSseDone(id, sseAgent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      console.error('[StoryAnalyzerAgent] Error:', msg);
      sendSseError(id, sseAgent, msg);
    }
  })();
});

// ─── GET /:id/credibility-review ──────────────────────────────────────────────
router.get('/:id/credibility-review', (req: Request, res: Response) => {
  const review = CredibilityReviewRepository.findByProjectId(req.params.id);
  if (!review) {
    res.status(404).json({ success: false, error: 'Credibility review not found', code: 'REVIEW_NOT_FOUND' });
    return;
  }
  const parsedRaw = JSON.parse(review.raw_json);
  res.json({
    success: true,
    data: {
      ...review,
      ...parsedRaw
    }
  });
});

// ─── POST /:id/credibility-review/generate ────────────────────────────────────
router.post('/:id/credibility-review/generate', (req: Request, res: Response) => {
  const { id } = req.params;

  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  const generatedPhases = ScriptRepository.findPhasesByProjectId(id);
  if (generatedPhases.length === 0) {
    res.status(400).json({ success: false, error: 'No phases generated yet.', code: 'NO_PHASES_FOUND' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
    return;
  }

  const sseAgent = 'CredibilityReviewerAgent';
  res.json({ success: true, message: 'Credibility review started' });

  void (async () => {
    try {
      sendSseChunk(id, sseAgent, '\n--- Starting Credibility and Fact-Checking Review ---\n');

      const reviewData = await credibilityReviewerAgent.analyze(
        id,
        generatedPhases.map(p => ({
          phase_number: p.phase_number,
          phase_title: p.phase_title,
          narration_text: p.narration_text || p.phase_content
        })),
        {
          topic: project.topic,
          content_type: project.content_type || 'auto',
          narration_language: project.narration_language || 'English'
        },
        undefined,
        settings.model,
        { temperature: 0.1 },
        (chunk) => sendSseChunk(id, sseAgent, chunk)
      );

      CredibilityReviewRepository.createOrUpdate(id, reviewData);

      sendSseDone(id, sseAgent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credibility review failed';
      console.error('[CredibilityReviewerAgent] Error:', msg);
      sendSseError(id, sseAgent, msg);
    }
  })();
});

// ─── POST /:id/script/phases/:phaseNumber/apply-credibility-fix ──────────────
router.post(
  '/:id/script/phases/:phaseNumber/apply-credibility-fix',
  async (req: Request, res: Response) => {
    const { id, phaseNumber } = req.params;
    const pNum = parseInt(phaseNumber, 10);
    const { issues } = req.body;

    try {
      const project = ProjectRepository.findById(id);
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
        return;
      }

      const bibleRow = BibleRepository.findByProjectId(id);
      if (!bibleRow) {
        res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
        return;
      }
      const bibleData = JSON.parse(bibleRow.raw_json) as ProductionBibleData;

      const phase = ScriptRepository.findPhaseByNumber(id, pNum);
      if (!phase) {
        res.status(404).json({ success: false, error: 'Phase not found', code: 'PHASE_NOT_FOUND' });
        return;
      }

      const prevPhase = ScriptRepository.findPhaseByNumber(id, pNum - 1);
      const prevPhaseText = prevPhase ? (prevPhase.narration_text || prevPhase.phase_content || '') : '';

      const nextPhase = ScriptRepository.findPhaseByNumber(id, pNum + 1);
      const nextPhaseText = nextPhase ? (nextPhase.narration_text || nextPhase.phase_content || '') : '';

      const settings = SettingsRepository.getSettings();
      if (!settings.apiKey) {
        res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
        return;
      }

      const languageRules = resolveLanguageRules(project.narration_language || 'English');
      const minWords = pNum === 1 ? 10 : 20;
      const bibleContext = `Characters: ${JSON.stringify(bibleData.character_roster)}\nLocations: ${JSON.stringify(bibleData.location_roster)}\nVisual Style Lock: ${JSON.stringify(bibleData.visual_style_lock)}`;

      const rewrittenText = await scriptAgent.rewriteNarrationForCredibility({
        projectId: id,
        phaseText: phase.narration_text || phase.phase_content || '',
        issues,
        prevPhaseText,
        nextPhaseText,
        bibleContext,
        languageRules,
        minWords,
        apiKey: undefined,
        modelName: settings.model,
        config: { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
      });

      const newWordCount = getWordCount(rewrittenText, project.narration_language || 'English');

      // Update Phase and set scenes_generated to false
      ScriptRepository.updatePhase(id, pNum, phase.phase_title, rewrittenText, rewrittenText, newWordCount);
      ScriptRepository.markPhaseScenesGenerated(id, pNum, false);

      const warnings: string[] = [];

      // 1. word-count floor warning
      if (newWordCount < minWords) {
        warnings.push(`Phase ${pNum} narration is under the minimum word count (${minWords}).`);
      }

      // 2. checkNarrationPurity (with brand + roster whitelist)
      const BRAND_WHITELIST = ['STING', 'VVS', 'Veo', 'Google', 'Gemini'];
      const charNames = (bibleData.character_roster || []).map((c: any) => c.name).filter(Boolean);
      const allowedTokens = [...BRAND_WHITELIST, ...charNames];
      const purity = checkNarrationPurity(rewrittenText, project.narration_language || 'English', { allowedTokens });
      if (!purity.ok) {
        warnings.push(`Phase ${pNum} narration: possible foreign-script words — ${purity.foreignWords.join(', ')}`);
      }

      // 3. if phaseNumber ∈ plan.rehookPhases → runRehookValidation
      const profile = resolveContentProfile(project.content_profile || 'viral_story');
      const plan = buildPhasePlan(project.target_duration_minutes ?? 8, profile);
      if (plan.rehookPhases.includes(pNum)) {
        try {
          await runRehookValidation(id, pNum, rewrittenText, undefined, settings.model);
        } catch (valErr: any) {
          console.error(`[RehookValidation] Error validating phase ${pNum} during credibility fix:`, valErr);
        }
      }

      // 4. if phaseNumber===1 → hookScorerAgent.run + updatePhaseHookScore
      if (pNum === 1) {
        try {
          const scoreResult = await hookScorerAgent.run(
            id,
            rewrittenText,
            undefined,
            settings.model,
            { temperature: 0.1, scoringObjective: profile.scoringObjective }
          );

          const passed = scoreResult.overall >= profile.hookThreshold ? 1 : 0;
          const borderline = (scoreResult.overall >= profile.hookThreshold - 0.5 && scoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
          ScriptRepository.updatePhaseHookScore(
            id,
            1,
            scoreResult.overall,
            JSON.stringify(scoreResult),
            passed,
            borderline
          );
        } catch (scoreErr: any) {
          console.error('[HookScorerAgent] Error scoring hook during credibility fix:', scoreErr);
        }
      }

      // Remove applied issues from the stored credibility review, and set stale/needs_recheck flags
      const review = CredibilityReviewRepository.findByProjectId(id);
      if (review) {
        const reviewData = JSON.parse(review.raw_json);
        reviewData.issues = (reviewData.issues || []).filter((existing: any) => {
          const matches = issues.some((applied: any) =>
            applied.phase_number === existing.phase_number &&
            applied.claim === existing.claim &&
            applied.explanation === existing.explanation
          );
          return !matches;
        });
        reviewData.needs_recheck = true;
        reviewData.stale = true;
        CredibilityReviewRepository.createOrUpdate(id, reviewData);
      }

      const updatedPhase = ScriptRepository.findPhaseByNumber(id, pNum);
      res.json({
        success: true,
        phase: updatedPhase,
        warnings,
      });
    } catch (err: any) {
      console.error('[ApplyCredibilityFix] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to apply credibility fix' });
    }
  }
);

// ─── POST /:id/script/apply-all-credibility-fixes ───────────────────────────
router.post(
  '/:id/script/apply-all-credibility-fixes',
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const project = ProjectRepository.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }

    const bibleRow = BibleRepository.findByProjectId(id);
    if (!bibleRow) {
      res.status(400).json({ success: false, error: 'Production Bible not found', code: 'BIBLE_NOT_FOUND' });
      return;
    }
    const bibleData = JSON.parse(bibleRow.raw_json) as ProductionBibleData;

    const settings = SettingsRepository.getSettings();
    if (!settings.apiKey) {
      res.status(401).json({ success: false, error: 'Gemini API Key missing.', code: 'API_KEY_MISSING' });
      return;
    }

    const review = CredibilityReviewRepository.findByProjectId(id);
    if (!review) {
      res.status(404).json({ success: false, error: 'No active credibility review found', code: 'REVIEW_NOT_FOUND' });
      return;
    }
    const reviewData = JSON.parse(review.raw_json);
    const activeIssues = reviewData.issues || [];
    if (activeIssues.length === 0) {
      res.json({ success: true, message: 'No credibility issues to fix.' });
      return;
    }

    const sseAgent = 'CredibilityReviewerAgent';
    res.json({ success: true, message: 'Applying all credibility fixes and regenerating review' });

    void (async () => {
      try {
        sendSseHookRewriteStart(id, sseAgent);
        sendSseChunk(id, sseAgent, '\n--- Applying Fact-Checking Corrections ---\n');

        const languageRules = resolveLanguageRules(project.narration_language || 'English');
        const bibleContext = `Characters: ${JSON.stringify(bibleData.character_roster)}\nLocations: ${JSON.stringify(bibleData.location_roster)}\nVisual Style Lock: ${JSON.stringify(bibleData.visual_style_lock)}`;

        const profile = resolveContentProfile(project.content_profile || 'viral_story');
        const plan = buildPhasePlan(project.target_duration_minutes ?? 8, profile);

        // Group active issues by phase_number
        const issuesByPhase: Record<number, any[]> = {};
        for (const issue of activeIssues) {
          if (!issuesByPhase[issue.phase_number]) {
            issuesByPhase[issue.phase_number] = [];
          }
          issuesByPhase[issue.phase_number].push(issue);
        }

        const phaseNumbers = Object.keys(issuesByPhase).map(Number);
        const rewriteResults: Array<{
          phaseNumber: number;
          rewrittenText: string;
          newWordCount: number;
          rehookType?: string | null;
          rehookValidated?: number;
          hookScoreResult?: any;
        }> = [];

        // Run rewrites and validators outside transaction
        for (const pNum of phaseNumbers) {
          sendSseChunk(id, sseAgent, `Rewriting narration for Phase ${pNum}...\n`);

          const phase = ScriptRepository.findPhaseByNumber(id, pNum);
          if (!phase) continue;

          const prevPhase = ScriptRepository.findPhaseByNumber(id, pNum - 1);
          const prevPhaseText = prevPhase ? (prevPhase.narration_text || prevPhase.phase_content || '') : '';
          const nextPhase = ScriptRepository.findPhaseByNumber(id, pNum + 1);
          const nextPhaseText = nextPhase ? (nextPhase.narration_text || nextPhase.phase_content || '') : '';

          const minWords = pNum === 1 ? 10 : 20;
          const phaseIssues = issuesByPhase[pNum];

          const rewrittenText = await scriptAgent.rewriteNarrationForCredibility({
            projectId: id,
            phaseText: phase.narration_text || phase.phase_content || '',
            issues: phaseIssues,
            prevPhaseText,
            nextPhaseText,
            bibleContext,
            languageRules,
            minWords,
            apiKey: undefined,
            modelName: settings.model,
            config: { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
          });

          const newWordCount = getWordCount(rewrittenText, project.narration_language || 'English');

          let rehookType: string | null = null;
          let rehookValidated = 0;
          if (plan.rehookPhases.includes(pNum)) {
            let validated = false;
            let detected_type = '';
            let reason = '';
            let attempts = 0;
            while (attempts < 3) {
              try {
                const result = await scriptAgent.validateRehook(id, rewrittenText, undefined, settings.model);
                validated = result.validated;
                detected_type = result.detected_type;
                reason = result.reason;
                if (validated) break;
              } catch (e: any) {
                reason = e.message;
              }
              attempts++;
            }
            if (validated) {
              const allowedTypes = ['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt'];
              let finalType: string | null = detected_type ? detected_type.toLowerCase().trim().replace(/['"]/g, '') : null;
              if (finalType && !allowedTypes.includes(finalType)) {
                if (finalType.includes('question')) finalType = 'new_question';
                else if (finalType.includes('revelation')) finalType = 'revelation';
                else if (finalType.includes('stake')) finalType = 'stakes_escalation';
                else if (finalType.includes('pattern')) finalType = 'pattern_interrupt';
                else finalType = null;
              }
              rehookType = finalType;
              rehookValidated = 1;
            } else {
              rehookValidated = 0;
            }
          }

          let hookScoreResult: any = null;
          if (pNum === 1) {
            try {
              hookScoreResult = await hookScorerAgent.run(
                id,
                rewrittenText,
                undefined,
                settings.model,
                { temperature: 0.1, scoringObjective: profile.scoringObjective }
              );
            } catch (scoreErr) {
              console.error('[HookScorerAgent] Error scoring hook during apply all:', scoreErr);
            }
          }

          rewriteResults.push({
            phaseNumber: pNum,
            rewrittenText,
            newWordCount,
            rehookType,
            rehookValidated,
            hookScoreResult,
          });
        }

        // Apply all database writes in a transaction
        db.transaction(() => {
          for (const res of rewriteResults) {
            const phase = ScriptRepository.findPhaseByNumber(id, res.phaseNumber);
            if (!phase) continue;

            ScriptRepository.updatePhase(id, res.phaseNumber, phase.phase_title, res.rewrittenText, res.rewrittenText, res.newWordCount);
            ScriptRepository.markPhaseScenesGenerated(id, res.phaseNumber, false);

            if (plan.rehookPhases.includes(res.phaseNumber)) {
              ScriptRepository.updatePhaseRehook(id, res.phaseNumber, res.rehookValidated ?? 0, res.rehookType ?? null);
            }

            if (res.phaseNumber === 1 && res.hookScoreResult) {
              const passed = res.hookScoreResult.overall >= profile.hookThreshold ? 1 : 0;
              const borderline = (res.hookScoreResult.overall >= profile.hookThreshold - 0.5 && res.hookScoreResult.overall <= profile.hookThreshold - 0.1) ? 1 : 0;
              ScriptRepository.updatePhaseHookScore(
                id,
                1,
                res.hookScoreResult.overall,
                JSON.stringify(res.hookScoreResult),
                passed,
                borderline
              );
            }
          }
        })();

        // After all phases are done: trigger ONE full credibility review regen
        sendSseChunk(id, sseAgent, '\n--- Running Credibility and Fact-Checking Review ---\n');

        const phasesList = ScriptRepository.findPhasesByProjectId(id);
        const reviewData = await credibilityReviewerAgent.analyze(
          id,
          phasesList.map(p => ({
            phase_number: p.phase_number,
            phase_title: p.phase_title,
            narration_text: p.narration_text || p.phase_content
          })),
          {
            topic: project.topic,
            content_type: project.content_type || 'auto',
            narration_language: project.narration_language || 'English'
          },
          undefined,
          settings.model,
          { temperature: 0.1 },
          (chunk) => sendSseChunk(id, sseAgent, chunk)
        );

        // Clear stale/needs_recheck flags on success!
        reviewData.needs_recheck = false;
        reviewData.stale = false;

        CredibilityReviewRepository.createOrUpdate(id, reviewData);

        sendSseDone(id, sseAgent);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Apply all fixes failed';
        console.error('[ApplyAllCredibilityFixes] Error:', msg);
        sendSseError(id, sseAgent, msg);
      }
    })();
  }
);

export default router;
