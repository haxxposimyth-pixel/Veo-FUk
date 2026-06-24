import { Router } from 'express';
import type { Request, Response } from 'express';
import { ProjectRepository } from '../db/repositories/project.repo';
import { projectCreateSchema, projectUpdateSchema } from 'shared';
import { validateBody } from '../middleware/validate.middleware';
import { checkProjectIntegrity } from '../utils/integrity';
import db from '../db/connection';

const router = Router();

// GET /api/v1/projects — list all
router.get('/', (_req: Request, res: Response) => {
  const projects = ProjectRepository.findAll();
  res.json({ success: true, data: projects });
});

// POST /api/v1/projects — create
router.post(
  '/',
  (req: Request, _res: Response, next) => {
    (req as any)._contentProfileAbsent = !req.body || req.body.content_profile === undefined || req.body.content_profile === null || req.body.content_profile === '';
    next();
  },
  validateBody(projectCreateSchema),
  (req: Request, res: Response) => {
    const body = { ...req.body };
    const contentType = body.content_type || 'auto';

    if ((req as any)._contentProfileAbsent) {
      if (contentType === 'documentary') {
        body.content_profile = 'documentary';
      } else if (contentType === 'narrative') {
        body.content_profile = 'narrative_fiction';
      } else if (contentType === 'presenter') {
        body.content_profile = 'tutorial';
      } else {
        body.content_profile = 'viral_story';
      }
    }

    const project = ProjectRepository.create({
      ...body,
      content_type: contentType,
    });
    res.status(201).json({ success: true, data: project });
  }
);

// GET /api/v1/projects/:id/integrity — check project integrity
router.get('/:id/integrity', (req: Request, res: Response) => {
  const project = ProjectRepository.findById(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  const report = checkProjectIntegrity(req.params.id);
  res.json({ success: true, data: report });
});

// GET /api/v1/projects/:id — read one
router.get('/:id', (req: Request, res: Response) => {
  const project = ProjectRepository.findById(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: project });
});

// PUT /api/v1/projects/:id — update
router.put('/:id', validateBody(projectUpdateSchema), (req: Request, res: Response) => {
  const existing = ProjectRepository.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  if (req.body.status === 'complete') {
    const report = checkProjectIntegrity(req.params.id);
    if (report.verdict === 'issues') {
      res.status(400).json({
        success: false,
        error: 'Project has unresolved integrity issues',
        code: 'PROJECT_INTEGRITY_ISSUES',
        data: { status: existing.status },
        integrity: report
      });
      return;
    }
  }

  const updated = ProjectRepository.update(req.params.id, req.body);
  res.json({ success: true, data: updated });
});

// DELETE /api/v1/projects/:id — delete
router.delete('/:id', (req: Request, res: Response) => {
  const existing = ProjectRepository.findById(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  ProjectRepository.delete(req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
});

// GET /api/v1/projects/:id/status — get status
router.get('/:id/status', (req: Request, res: Response) => {
  const project = ProjectRepository.findById(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  res.json({ success: true, data: { status: project.status } });
});

// POST /api/v1/projects/:id/duplicate — duplicate project
router.post('/:id/duplicate', (req: Request, res: Response) => {
  const duplicated = ProjectRepository.duplicate(req.params.id);
  if (!duplicated) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }
  res.status(201).json({ success: true, data: duplicated });
});

// GET /api/v1/projects/:id/usage — get project token & cost usage
router.get('/:id/usage', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const project = ProjectRepository.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    return;
  }

  try {
    const rows = db.prepare(`
      SELECT 
        agent_name,
        model_used,
        COALESCE(input_tokens, 0) as input_tokens,
        COALESCE(output_tokens, 0) as output_tokens,
        COALESCE(cached_tokens, 0) as cached_tokens,
        COALESCE(thinking_tokens, 0) as thinking_tokens,
        COALESCE(total_tokens, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as total_tokens,
        COALESCE(cost, 0) as cost,
        CASE WHEN tokens_estimated IS NULL THEN 1 ELSE tokens_estimated END as tokens_estimated,
        COALESCE(billing_source, 'ai_studio') as billing_source,
        phase_number
      FROM agent_logs
      WHERE project_id = ?
    `).all(projectId) as any[];

    // Totals
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let thinkingTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let estimatedRowCount = 0;

    // Grouping helpers
    const agentMap = new Map<string, any>();
    const phaseMap = new Map<string, any>();
    const sourceMap = new Map<string, any>();

    for (const r of rows) {
      inputTokens += r.input_tokens;
      outputTokens += r.output_tokens;
      cachedTokens += r.cached_tokens;
      thinkingTokens += r.thinking_tokens;
      totalTokens += r.total_tokens;
      totalCost += r.cost;

      if (r.tokens_estimated === 1) {
        estimatedRowCount++;
      }

      // Breakdown by Agent
      const agent = r.agent_name || 'unknown';
      let agentData = agentMap.get(agent);
      if (!agentData) {
        agentData = { agent_name: agent, inputTokens: 0, outputTokens: 0, cachedTokens: 0, thinkingTokens: 0, totalTokens: 0, cost: 0 };
        agentMap.set(agent, agentData);
      }
      agentData.inputTokens += r.input_tokens;
      agentData.outputTokens += r.output_tokens;
      agentData.cachedTokens += r.cached_tokens;
      agentData.thinkingTokens += r.thinking_tokens;
      agentData.totalTokens += r.total_tokens;
      agentData.cost += r.cost;

      // Breakdown by Phase
      const phase = r.phase_number === null || r.phase_number === undefined ? 'foundation' : `Phase ${r.phase_number}`;
      let phaseData = phaseMap.get(phase);
      if (!phaseData) {
        phaseData = { phase, inputTokens: 0, outputTokens: 0, cachedTokens: 0, thinkingTokens: 0, totalTokens: 0, cost: 0 };
        phaseMap.set(phase, phaseData);
      }
      phaseData.inputTokens += r.input_tokens;
      phaseData.outputTokens += r.output_tokens;
      phaseData.cachedTokens += r.cached_tokens;
      phaseData.thinkingTokens += r.thinking_tokens;
      phaseData.totalTokens += r.total_tokens;
      phaseData.cost += r.cost;

      // Split by Billing Source
      const source = r.billing_source;
      let sourceData = sourceMap.get(source);
      if (!sourceData) {
        sourceData = { billing_source: source, totalTokens: 0, cost: 0 };
        sourceMap.set(source, sourceData);
      }
      sourceData.totalTokens += r.total_tokens;
      sourceData.cost += r.cost;
    }

    const estimatedPercentage = rows.length > 0 
      ? Math.round((estimatedRowCount / rows.length) * 1000) / 10 
      : 0;

    res.json({
      success: true,
      data: {
        totals: {
          inputTokens,
          outputTokens,
          cachedTokens,
          thinkingTokens,
          totalTokens,
          totalCost: Math.round(totalCost * 10000) / 10000,
        },
        byAgent: Array.from(agentMap.values()),
        byPhase: Array.from(phaseMap.values()).sort((a, b) => {
          if (a.phase === 'foundation') return -1;
          if (b.phase === 'foundation') return 1;
          const aNum = parseInt(a.phase.replace('Phase ', ''), 10);
          const bNum = parseInt(b.phase.replace('Phase ', ''), 10);
          return aNum - bNum;
        }),
        byBillingSource: Array.from(sourceMap.values()),
        estimatedPercentage
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
