import db from '../connection';
import type { CredibilityReviewData } from 'shared';
import crypto from 'crypto';

export interface CredibilityReviewRow {
  id: string;
  project_id: string;
  raw_json: string;
  overall_credibility_score: number;
  summary: string;
  created_at?: string;
}

export const CredibilityReviewRepository = {
  findByProjectId(projectId: string): CredibilityReviewRow | null {
    const row = db.prepare('SELECT * FROM credibility_reviews WHERE project_id = ?').get(projectId);
    return row ? (row as CredibilityReviewRow) : null;
  },

  createOrUpdate(projectId: string, data: CredibilityReviewData): CredibilityReviewRow {
    const rawJson = JSON.stringify(data);
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO credibility_reviews (id, project_id, raw_json, overall_credibility_score, summary)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        raw_json = excluded.raw_json,
        overall_credibility_score = excluded.overall_credibility_score,
        summary = excluded.summary,
        created_at = datetime('now')
    `).run(id, projectId, rawJson, data.overall_credibility_score, data.summary);

    return this.findByProjectId(projectId)!;
  }
};
