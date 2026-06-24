import db from '../connection';
import type { Script, ScriptData, Phase, ScriptPhaseItem, PhaseStatus } from 'shared';
import { buildPhasePlan, resolveContentProfile } from 'shared';
import crypto from 'crypto';
import { ProjectRepository } from './project.repo';

export const ScriptRepository = {

  findByProjectId(projectId: string): Script | null {
    const row = db.prepare('SELECT * FROM scripts WHERE project_id = ?').get(projectId);
    return row ? (row as Script) : null;
  },

  createOrUpdate(projectId: string, data: ScriptData): Script {
    const existing = this.findByProjectId(projectId);
    const rawJson = JSON.stringify(data);

    if (existing) {
      db.prepare(`
        UPDATE scripts SET raw_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
      `).run(rawJson, projectId);
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO scripts (id, project_id, raw_json, approved, version) VALUES (?, ?, ?, 0, 1)
      `).run(id, projectId, rawJson);
    }

    // Sync phase rows
    this._syncPhases(projectId, data.phases);

    return this.findByProjectId(projectId)!;
  },

  approve(projectId: string, approved: boolean): void {
    db.prepare('UPDATE scripts SET approved = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
      .run(approved ? 1 : 0, projectId);
  },

  // ─── Phases ────────────────────────────────────────────────────────────────

  findPhasesByProjectId(projectId: string): Phase[] {
    return db.prepare('SELECT * FROM phases WHERE project_id = ? ORDER BY phase_number ASC').all(projectId) as Phase[];
  },

  findPhaseByNumber(projectId: string, phaseNumber: number): Phase | null {
    const row = db.prepare('SELECT * FROM phases WHERE project_id = ? AND phase_number = ?').get(projectId, phaseNumber);
    return row ? (row as Phase) : null;
  },

  updatePhase(projectId: string, phaseNumber: number, title: string, content: string, narrationText?: string, narrationWordCount?: number): void {
    const finalNarrationText = narrationText !== undefined ? narrationText : content;
    const finalNarrationWordCount = narrationWordCount !== undefined ? narrationWordCount : finalNarrationText.trim().split(/\s+/).filter(Boolean).length;

    db.prepare(`
      UPDATE phases SET phase_title = ?, phase_content = ?, narration_text = ?, narration_word_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ? AND phase_number = ?
    `).run(title, content, finalNarrationText, finalNarrationWordCount, projectId, phaseNumber);

    // Keep raw_json in scripts table consistent
    const script = this.findByProjectId(projectId);
    if (script) {
      const scriptData = JSON.parse(script.raw_json) as ScriptData;
      const idx = scriptData.phases.findIndex((p) => p.phase_number === phaseNumber);
      if (idx !== -1) {
        scriptData.phases[idx].phase_title   = title;
        scriptData.phases[idx].phase_content = content;
        scriptData.phases[idx].narration_text = finalNarrationText;
        scriptData.phases[idx].narration_word_count = finalNarrationWordCount;
        db.prepare('UPDATE scripts SET raw_json = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
          .run(JSON.stringify(scriptData), projectId);
      }
    }
  },

  markPhaseScenesGenerated(projectId: string, phaseNumber: number, generated: boolean): void {
    db.prepare('UPDATE phases SET scenes_generated = ? WHERE project_id = ? AND phase_number = ?')
      .run(generated ? 1 : 0, projectId, phaseNumber);
  },

  updatePhaseHookScore(projectId: string, phaseNumber: number, hookScore: number, breakdown: string, passed: number, borderline: number): void {
    db.prepare(`
      UPDATE phases SET hook_score = ?, hook_score_breakdown = ?, hook_score_passed = ?, hook_score_borderline = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ? AND phase_number = ?
    `).run(hookScore, breakdown, passed, borderline, projectId, phaseNumber);
  },

  updatePhaseStatus(projectId: string, phaseNumber: number, status: PhaseStatus): void {
    db.prepare('UPDATE phases SET status = ? WHERE project_id = ? AND phase_number = ?')
      .run(status, projectId, phaseNumber);
  },

  updatePhaseRehook(projectId: string, phaseNumber: number, validated: number, type: string | null): void {
    db.prepare(`
      UPDATE phases SET rehook_validated = ?, rehook_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ? AND phase_number = ?
    `).run(validated, type, projectId, phaseNumber);

    // Keep raw_json in scripts table consistent
    const script = this.findByProjectId(projectId);
    if (script) {
      const scriptData = JSON.parse(script.raw_json) as ScriptData;
      const idx = scriptData.phases.findIndex((p) => p.phase_number === phaseNumber);
      if (idx !== -1) {
        scriptData.phases[idx].rehook_type = type as any;
        db.prepare('UPDATE scripts SET raw_json = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
          .run(JSON.stringify(scriptData), projectId);
      }
    }
  },

  findPhaseById(phaseId: number): Phase | null {
    const row = db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId);
    return row ? (row as Phase) : null;
  },

  _syncPhases(projectId: string, phases: ScriptPhaseItem[]): void {
    const del = db.prepare('DELETE FROM phases WHERE project_id = ?');
    const ins = db.prepare(`
      INSERT INTO phases (id, project_id, phase_number, phase_type, phase_title, phase_content, narration_text, narration_word_count, approved, scenes_generated, status, rehook_required, rehook_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pending', ?, ?)
    `);
    const project = ProjectRepository.findById(projectId);
    const profile = resolveContentProfile(project?.content_profile || 'viral_story');
    const plan = buildPhasePlan(project?.target_duration_minutes ?? 8, profile);
    db.transaction(() => {
      del.run(projectId);
      for (const p of phases) {
        const narrationText = p.narration_text ?? p.phase_content ?? '';
        const narrationWordCount = p.narration_word_count ?? narrationText.trim().split(/\s+/).filter(Boolean).length;
        const rehookRequired = plan.rehookPhases.includes(p.phase_number) ? 1 : 0;
        const rehookType = rehookRequired ? (p.rehook_type ?? null) : null;
        ins.run(crypto.randomUUID(), projectId, p.phase_number, p.phase_type, p.phase_title, p.phase_content, narrationText, narrationWordCount, rehookRequired, rehookType);
      }
    })();
  },
};
