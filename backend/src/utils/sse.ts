import { Response } from 'express';

// Global cache of active SSE client sockets
export const sseClients = new Map<string, Response>();

/**
 * Generates a unique key for an SSE subscription based on project ID and target agent.
 */
export function getSseKey(projectId: string, agentName: string): string {
  return `${projectId}:${agentName}`;
}

/**
 * Emits a text chunk to a subscribed SSE client.
 */
export function sendSseChunk(projectId: string, agentName: string, text: string): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'chunk', data: text })}\n\n`);
  }
}

/**
 * Emits a progress event to a subscribed SSE client.
 */
export function sendSseProgress(
  projectId: string,
  agentName: string,
  progress: { current: number; total: number; phase: number; scene: number }
): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
  }
}

/**
 * Emits a completion event to a subscribed SSE client.
 */
export function sendSseDone(projectId: string, agentName: string): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
  }
}

/**
 * Emits an error event to a subscribed SSE client.
 */
export function sendSseError(projectId: string, agentName: string, errorMsg: string): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'error', data: errorMsg })}\n\n`);
  }
}

/**
 * Emits a hook score event to a subscribed SSE client.
 */
export function sendSseHookScore(
  projectId: string,
  agentName: string,
  score: number,
  passed: boolean,
  feedback: string
): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'hook_score', score, passed, feedback })}\n\n`);
  }
}

/**
 * Emits a story analysis completion event to a subscribed SSE client.
 */
export function sendSseStoryAnalysisComplete(
  projectId: string,
  agentName: string,
  overall_retention_score: number,
  dropout_risk_phases: number[],
  peak_moment_phase: number
): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({
      type: 'story_analysis_complete',
      overall_retention_score,
      dropout_risk_phases,
      peak_moment_phase
    })}\n\n`);
  }
}

/**
 * Emits a hook rewrite start event to a subscribed SSE client.
 */
export function sendSseHookRewriteStart(projectId: string, agentName: string): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'hook_rewrite_start' })}\n\n`);
  }
}

/**
 * Emits a hook rewrite complete event with new word count to a subscribed SSE client.
 */
export function sendSseHookRewriteComplete(projectId: string, agentName: string, newWordCount: number): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'hook_rewrite_complete', new_word_count: newWordCount })}\n\n`);
  }
}

/**
 * Emits a keepalive heartbeat to a subscribed SSE client.
 * Used during long-running LLM generations to prevent frontend inactivity watchdogs
 * from closing the connection during silent periods between streaming chunks.
 */
export function sendSseHeartbeat(projectId: string, agentName: string): void {
  const key = getSseKey(projectId, agentName);
  const client = sseClients.get(key);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
  }
}


