import { Router } from 'express';
import type { Request, Response } from 'express';
import { ProjectRepository }      from '../db/repositories/project.repo';
import { StoryPlanRepository }    from '../db/repositories/storyplan.repo';
import { SettingsRepository }     from '../db/repositories/settings.repo';
import { storyPlannerAgent }      from '../agents/story-planner-agent';
import { storyPlanAgentOutputSchema } from 'shared';
import { validateBody }           from '../middleware/validate.middleware';
import { sendSseChunk, sendSseDone, sendSseError } from '../utils/sse';
import { StructuredOutputError } from '../utils/structured-output.error';

const router = Router();

// GET /:id/storyplan
router.get('/:id/storyplan', (req: Request, res: Response) => {
  const plan = StoryPlanRepository.findByProjectId(req.params.id);
  if (!plan) {
    res.status(404).json({ success: false, error: 'Story plan not found', code: 'STORY_PLAN_NOT_FOUND' });
    return;
  }
  res.json({
    success: true,
    data: plan
  });
});

// PUT /:id/storyplan
router.put(
  '/:id/storyplan',
  validateBody(storyPlanAgentOutputSchema),
  (req: Request, res: Response) => {
    const project = ProjectRepository.findById(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      return;
    }
    const saved = StoryPlanRepository.createOrUpdate(req.params.id, req.body);
    res.json({
      success: true,
      data: saved
    });
  }
);

// POST /:id/storyplan/generate
router.post('/:id/storyplan/generate', (req: Request, res: Response) => {
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

  res.json({ success: true, message: 'Story plan generation started' });

  void (async () => {
    try {
      let engagementBlueprint: any = undefined;
      if ((project as any).concept_brief) {
        try {
          const parsed = JSON.parse((project as any).concept_brief);
          if (parsed && parsed.engagement_blueprint) {
            engagementBlueprint = parsed.engagement_blueprint;
          }
        } catch (e) {
          console.warn('[storyplan route] Failed to parse concept_brief:', e);
        }
      }

      const planData = await storyPlannerAgent.run(
        project.topic,
        project.visual_style,
        project.narration_language,
        project.aspect_ratio,
        id,
        undefined,
        settings.model,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens },
        (chunk) => sendSseChunk(id, 'StoryPlannerAgent', chunk),
        project.youtube_transcript || undefined,
        project.content_type || 'auto',
        engagementBlueprint,
        (project as any).content_profile || 'viral_story',
      );

      StoryPlanRepository.createOrUpdate(id, planData);
      ProjectRepository.updateStatus(id, 'planning');
      sendSseDone(id, 'StoryPlannerAgent');
    } catch (err: unknown) {
      const isStructuredError = err instanceof StructuredOutputError;
      const msg = isStructuredError
        ? 'The AI returned an invalid response after 2 attempts. Try regenerating or switching to a more capable model in AI Settings.'
        : (err instanceof Error ? err.message : 'Story plan generation failed');
      console.error('[StoryPlannerAgent] Error:', msg);
      sendSseError(id, 'StoryPlannerAgent', msg);
    }
  })();
});

// POST /:id/storyplan/approve
router.post('/:id/storyplan/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const project = ProjectRepository.findById(id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  StoryPlanRepository.approvePlan(id, true);
  ProjectRepository.updateStatus(id, 'bible');

  res.json({ success: true, message: 'Story plan approved' });
});

export default router;
