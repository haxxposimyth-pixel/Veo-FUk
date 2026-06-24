import db from '../connection';
import type { Scene, SceneItem } from 'shared';
import crypto from 'crypto';

export const SceneRepository = {

  findByProjectId(projectId: string): Scene[] {
    return db.prepare(`
      SELECT * FROM scenes WHERE project_id = ? ORDER BY phase_number ASC, scene_number ASC
    `).all(projectId) as Scene[];
  },

  findByPhase(projectId: string, phaseNumber: number): Scene[] {
    return db.prepare(`
      SELECT * FROM scenes WHERE project_id = ? AND phase_number = ? ORDER BY scene_number ASC
    `).all(projectId, phaseNumber) as Scene[];
  },

  findById(id: string): Scene | null {
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    return row ? (row as Scene) : null;
  },

  findBySceneNumber(projectId: string, phaseNumber: number, sceneNumber: number): Scene | null {
    const row = db.prepare(`
      SELECT * FROM scenes WHERE project_id = ? AND phase_number = ? AND scene_number = ?
    `).get(projectId, phaseNumber, sceneNumber);
    return row ? (row as Scene) : null;
  },

  createOrUpdateBatch(projectId: string, phaseId: string, phaseNumber: number, scenes: SceneItem[]): Scene[] {
    if (!scenes || scenes.length === 0) return this.findByPhase(projectId, phaseNumber);
    const existingScenes = this.findByPhase(projectId, phaseNumber);
    const existingMap = new Map(existingScenes.map(s => [s.scene_number, s.id]));

    const ins = db.prepare(`
      INSERT INTO scenes
        (id, project_id, phase_id, phase_number, scene_number, title,
         scene_description, continuity_notes, narration_fragment, veo_prompt_generated, status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const upd = db.prepare(`
      UPDATE scenes
      SET title = ?, scene_description = ?, continuity_notes = ?, narration_fragment = ?,
          status = ?, raw_json = ?, veo_prompt_generated = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const del = db.prepare(`
      DELETE FROM scenes WHERE id = ?
    `);

    db.transaction(() => {
      const newSceneNumbers = new Set(scenes.map(s => s.scene_number));

      for (const s of scenes) {
        if (existingMap.has(s.scene_number)) {
          const existingId = existingMap.get(s.scene_number)!;
          upd.run(
            s.title, s.scene_description, s.continuity_notes, s.narration_fragment,
            s.status ?? 'done', JSON.stringify(s), existingId
          );
        } else {
          ins.run(
            crypto.randomUUID(), projectId, phaseId, phaseNumber, s.scene_number,
            s.title, s.scene_description, s.continuity_notes, s.narration_fragment,
            s.status ?? 'done', JSON.stringify(s),
          );
        }
      }

      // Delete any leftover scenes that are no longer part of this phase
      for (const [num, id] of existingMap.entries()) {
        if (!newSceneNumbers.has(num)) {
          del.run(id);
        }
      }
    })();

    return this.findByPhase(projectId, phaseNumber);
  },

  createMissingBatch(projectId: string, phaseId: string, phaseNumber: number, scenes: SceneItem[]): Scene[] {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO scenes
        (id, project_id, phase_id, phase_number, scene_number, title,
         scene_description, continuity_notes, narration_fragment, veo_prompt_generated, status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    db.transaction(() => {
      for (const s of scenes) {
        ins.run(
          crypto.randomUUID(), projectId, phaseId, phaseNumber, s.scene_number,
          s.title, s.scene_description, s.continuity_notes, s.narration_fragment,
          s.status ?? 'done',
          JSON.stringify(s),
        );
      }
    })();

    return this.findByPhase(projectId, phaseNumber);
  },

  updateScene(id: string, scene: SceneItem): Scene | null {
    const status = (scene as any).status ?? 'done';
    const continuityStale = (scene as any).continuity_stale ?? 0;
    db.prepare(`
      UPDATE scenes
      SET title = ?, scene_description = ?, continuity_notes = ?, narration_fragment = ?,
          status = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP, continuity_stale = ?
      WHERE id = ?
    `).run(scene.title, scene.scene_description, scene.continuity_notes, scene.narration_fragment, status, JSON.stringify(scene), continuityStale, id);
    return this.findById(id);
  },

  markVeoGenerated(id: string, generated: boolean): void {
    db.prepare('UPDATE scenes SET veo_prompt_generated = ? WHERE id = ?').run(generated ? 1 : 0, id);
  },

  deleteByPhase(projectId: string, phaseNumber: number): void {
    db.prepare('DELETE FROM scenes WHERE project_id = ? AND phase_number = ?')
      .run(projectId, phaseNumber);
  },

  markDownstreamStale(projectId: string, phaseNumber: number, sceneNumber: number): void {
    // 1. Mark downstream scenes as stale in the database
    db.prepare(`
      UPDATE scenes
      SET continuity_stale = 1
      WHERE project_id = ? AND (phase_number > ? OR (phase_number = ? AND scene_number > ?))
    `).run(projectId, phaseNumber, phaseNumber, sceneNumber);

    // 2. Mark corresponding veo prompts as stale in their raw_json status
    const downstreamPrompts = db.prepare(`
      SELECT id, raw_json FROM veo_prompts
      WHERE project_id = ? AND (phase_number > ? OR (phase_number = ? AND scene_number > ?))
    `).all(projectId, phaseNumber, phaseNumber, sceneNumber) as { id: string; raw_json: string }[];

    const updateStmt = db.prepare('UPDATE veo_prompts SET raw_json = ? WHERE id = ?');
    db.transaction(() => {
      for (const p of downstreamPrompts) {
        try {
          const parsed = JSON.parse(p.raw_json);
          parsed.status = 'stale';
          updateStmt.run(JSON.stringify(parsed), p.id);
        } catch (e) {
          // ignore parsing error
        }
      }
    })();
  },
};
