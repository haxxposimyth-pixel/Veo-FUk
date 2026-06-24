import db from '../connection';
import type { StoryAnalysisData } from 'shared';
import crypto from 'crypto';

export interface StoryAnalysisRow {
  id: string;
  project_id: string;
  raw_json: string;
  overall_retention_score: number;
  dropout_risk_phases: string; // JSON array of numbers
  peak_moment_phase: number;
  summary: string;
  created_at?: string;
}

export const StoryAnalysisRepository = {
  findByProjectId(projectId: string): StoryAnalysisRow | null {
    const row = db.prepare('SELECT * FROM story_analyses WHERE project_id = ?').get(projectId);
    return row ? (row as StoryAnalysisRow) : null;
  },

  createOrUpdate(projectId: string, data: StoryAnalysisData): StoryAnalysisRow {
    const rawJson = JSON.stringify(data);
    const id = crypto.randomUUID();
    const dropoutRisk = JSON.stringify(data.dropout_risk_phases);

    db.prepare(`
      INSERT INTO story_analyses (id, project_id, raw_json, overall_retention_score, dropout_risk_phases, peak_moment_phase, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        raw_json = excluded.raw_json,
        overall_retention_score = excluded.overall_retention_score,
        dropout_risk_phases = excluded.dropout_risk_phases,
        peak_moment_phase = excluded.peak_moment_phase,
        summary = excluded.summary,
        created_at = datetime('now')
    `).run(id, projectId, rawJson, data.overall_retention_score, dropoutRisk, data.peak_moment_phase, data.summary);

    return this.findByProjectId(projectId)!;
  }
};
