import 'express-async-errors';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { runMigrations } from './db/migrations/runner';
import { verifySchema } from './db/connection';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimit } from './middleware/ratelimit.middleware';
import { sseClients, getSseKey } from './utils/sse';
import logger from './utils/logger';
import { config } from './config';

import { ProjectLockManager } from './utils/project-lock';

// ─── Global Error Handlers ──────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ─── Routes (top-level imports — no dynamic require) ─────────────────────────
import projectsRouter from './routes/projects.routes';
import bibleRouter from './routes/bible.routes';
import storyPlanRouter from './routes/storyplan.routes';
import scriptRouter from './routes/script.routes';
import scenesRouter from './routes/scenes.routes';
import veoPromptsRouter from './routes/veoprompts.routes';
import settingsRouter from './routes/settings.routes';
import exportRouter from './routes/export.routes';
import customStylesRouter from './routes/customstyles.routes';
import continuityRouter from './routes/continuity.routes';
import adminRouter from './routes/admin.routes';
import metadataRouter from './routes/metadata.routes';
import conceptRouter from './routes/concept.routes';

// ─── Database ─────────────────────────────────────────────────────────────────
try {
  runMigrations();
  verifySchema();
} catch (err) {
  logger.error('Database migration failed on startup:', err);
  process.exit(1);
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/projects', storyPlanRouter);
app.use('/api/v1/projects', bibleRouter);
app.use('/api/v1/projects', scriptRouter);
app.use('/api/v1/projects', scenesRouter);
app.use('/api/v1/projects', veoPromptsRouter);
app.use('/api/v1/projects', exportRouter);
app.use('/api/v1/projects', metadataRouter);
app.use('/api/v1/projects', continuityRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/custom-styles', customStylesRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1', conceptRouter);

// ─── SSE Streaming ───────────────────────────────────────────────────────────
app.get('/api/v1/stream/:projectId/:agentName', (req: Request, res: Response) => {
  const { projectId, agentName } = req.params;
  const key = getSseKey(projectId, agentName);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.set(key, res);
  logger.info(`SSE connected: ${key}`);

  res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(key);
    logger.info(`SSE disconnected: ${key}`);
    ProjectLockManager.releaseLockForAgent(projectId, agentName);
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Viral Video Studio AI Backend', version: '1.0.0' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorMiddleware);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`Backend running on port ${config.port}`);
});
