import db from '../connection';
import crypto from 'crypto';
import type { ContinuityWarning } from 'shared';

export class ContinuityRepository {
  static create(warning: Omit<ContinuityWarning, 'id' | 'resolved' | 'created_at'> & { phase_id: string, cross_phase?: number }): ContinuityWarning {
    const id = crypto.randomUUID();
    const crossVal = warning.cross_phase || 0;
    db.prepare(`
      INSERT INTO continuity_warnings 
        (id, project_id, phase_id, prompt_number, field, issue, suggestion, cross_phase)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, warning.project_id, warning.phase_id, warning.prompt_number, 
      warning.field, warning.issue, warning.suggestion, crossVal
    );
    return this.getById(id)!;
  }

  static getById(id: string): ContinuityWarning | undefined {
    return db.prepare('SELECT * FROM continuity_warnings WHERE id = ?').get(id) as ContinuityWarning | undefined;
  }

  static findByProject(projectId: string): ContinuityWarning[] {
    return db.prepare(`
      SELECT * FROM continuity_warnings 
      WHERE project_id = ? 
      ORDER BY prompt_number ASC
    `).all(projectId) as ContinuityWarning[];
  }

  static findByPhase(projectId: string, phaseId: string): ContinuityWarning[] {
    return db.prepare(`
      SELECT * FROM continuity_warnings 
      WHERE project_id = ? 
        AND (
          phase_id = ? 
          OR (
            cross_phase = 1 
            AND prompt_number IN (
              SELECT prompt_number FROM veo_prompts 
              WHERE project_id = ? 
                AND phase_number = (SELECT phase_number FROM phases WHERE id = ?)
            )
          )
        )
      ORDER BY prompt_number ASC
    `).all(projectId, phaseId, projectId, phaseId) as ContinuityWarning[];
  }

  static resolve(id: string, resolved: boolean): void {
    db.prepare('UPDATE continuity_warnings SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
  }

  static deleteByPhase(projectId: string, phaseId: string): void {
    db.prepare('DELETE FROM continuity_warnings WHERE project_id = ? AND phase_id = ?').run(projectId, phaseId);
  }

  static deleteCrossPhase(projectId: string): void {
    db.prepare('DELETE FROM continuity_warnings WHERE project_id = ? AND cross_phase = 1').run(projectId);
  }
}
