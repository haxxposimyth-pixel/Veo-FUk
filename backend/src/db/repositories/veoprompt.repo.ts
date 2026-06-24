import db from '../connection';
import type { VeoPrompt, VeoPromptData } from 'shared';
import crypto from 'crypto';

export const VeoPromptRepository = {

  findByProjectId(projectId: string): VeoPrompt[] {
    return db.prepare(`
      SELECT * FROM veo_prompts WHERE project_id = ? ORDER BY CAST(prompt_number AS INTEGER) ASC
    `).all(projectId) as VeoPrompt[];
  },

  findByPhase(projectId: string, phaseNumber: number): VeoPrompt[] {
    return db.prepare(`
      SELECT * FROM veo_prompts WHERE project_id = ? AND phase_number = ? ORDER BY scene_number
    `).all(projectId, phaseNumber) as VeoPrompt[];
  },

  findByPhaseAndScene(projectId: string, phaseNumber: number, sceneNumber: number): VeoPrompt | null {
    const row = db.prepare(`
      SELECT * FROM veo_prompts WHERE project_id = ? AND phase_number = ? AND scene_number = ?
    `).get(projectId, phaseNumber, sceneNumber);
    return row ? (row as VeoPrompt) : null;
  },

  findById(id: string): VeoPrompt | null {
    const row = db.prepare('SELECT * FROM veo_prompts WHERE id = ?').get(id);
    return row ? (row as VeoPrompt) : null;
  },

  async createOrUpdate(
    projectId: string,
    sceneId: string,
    phaseNumber: number,
    sceneNumber: number,
    data: VeoPromptData,
  ): Promise<VeoPrompt> {
    const existing = this.findByPhaseAndScene(projectId, phaseNumber, sceneNumber);
    const rawJson  = JSON.stringify(data);

    if (existing) {
      db.prepare(`
        UPDATE veo_prompts
        SET prompt_number = ?, visual = ?, shot = ?, shot_type = ?, lens = ?, lighting = ?, camera = ?,
            ambient_sound = ?, sfx = ?, dialogue = ?, avoid = ?, connection = ?, narration = ?,
            raw_json = ?, version = version + 1, manually_edited = 0, updated_at = CURRENT_TIMESTAMP,
            visual_truncated = ?, scene_type = ?
        WHERE id = ?
      `).run(
        data.prompt_number, data.visual, data.shot, data.shot_type || null, data.lens, data.lighting, data.camera,
        data.ambient_sound, data.sfx, data.dialogue, data.avoid, data.connection, data.narration,
        rawJson, data.visual_truncated ?? 0, data.scene_type ?? 'standard', existing.id,
      );
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO veo_prompts
          (id, project_id, scene_id, phase_number, scene_number, prompt_number,
           visual, shot, shot_type, lens, lighting, camera, ambient_sound, sfx, dialogue, avoid, connection, narration, raw_json, version, visual_truncated, scene_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id, projectId, sceneId, phaseNumber, sceneNumber, data.prompt_number,
        data.visual, data.shot, data.shot_type || null, data.lens, data.lighting, data.camera,
        data.ambient_sound, data.sfx, data.dialogue, data.avoid, data.connection, data.narration, rawJson,
        data.visual_truncated ?? 0, data.scene_type ?? 'standard',
      );

      // Mark scene as veo-generated
      db.prepare('UPDATE scenes SET veo_prompt_generated = 1 WHERE id = ?').run(sceneId);
    }

    await this._recalculatePromptNumbers(projectId);

    return this.findByPhaseAndScene(projectId, phaseNumber, sceneNumber)!;
  },

  async updateById(id: string, data: VeoPromptData): Promise<VeoPrompt | null> {
    db.prepare(`
      UPDATE veo_prompts
      SET prompt_number = ?, visual = ?, shot = ?, shot_type = ?, lens = ?, lighting = ?, camera = ?,
          ambient_sound = ?, sfx = ?, dialogue = ?, avoid = ?, connection = ?, narration = ?,
          raw_json = ?, manually_edited = 1, updated_at = CURRENT_TIMESTAMP, visual_truncated = ?,
          scene_type = ?
      WHERE id = ?
    `).run(
      data.prompt_number, data.visual, data.shot, data.shot_type || null, data.lens, data.lighting, data.camera,
      data.ambient_sound, data.sfx, data.dialogue, data.avoid, data.connection, data.narration,
      JSON.stringify(data), data.visual_truncated ?? 0, data.scene_type ?? 'standard', id,
    );

    const prompt = this.findById(id);
    if (prompt) {
      await this._recalculatePromptNumbers(prompt.project_id);
    }

    return this.findById(id);
  },

  async _recalculatePromptNumbers(projectId: string): Promise<void> {
    const { ProjectLockManager } = await import('../../utils/project-lock');
    return ProjectLockManager.serializeProjectOp(projectId, () => {
      const prompts = db.prepare(`
        SELECT id, raw_json, scene_number FROM veo_prompts
        WHERE project_id = ?
        ORDER BY phase_number ASC, scene_number ASC
      `).all(projectId) as { id: string; raw_json: string; scene_number: number }[];

      const stmt = db.prepare('UPDATE veo_prompts SET prompt_number = ?, raw_json = ? WHERE id = ?');
      db.transaction(() => {
        let counter = 1;
        prompts.forEach((p) => {
          const numStr = String(counter++);
          let updatedRawJson = p.raw_json;
          try {
            const parsed = JSON.parse(p.raw_json);
            parsed.prompt_number = numStr;
            if (parsed.veo_full_prompt) {
              const lines = parsed.veo_full_prompt.split('\n');
              if (lines.length > 0) {
                lines[0] = `Prompt ${numStr}:`;
                parsed.veo_full_prompt = lines.join('\n');
              }
            }
            updatedRawJson = JSON.stringify(parsed);
          } catch (e) {
            // ignore parsing error
          }
          stmt.run(numStr, updatedRawJson, p.id);
        });
      })();
    });
  },
};
