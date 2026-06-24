import db from '../connection';
import type { ProductionBible, ProductionBibleData } from 'shared';
import crypto from 'crypto';

export const BibleRepository = {

  findByProjectId(projectId: string): ProductionBible | null {
    const row = db.prepare('SELECT * FROM production_bibles WHERE project_id = ?').get(projectId);
    return row ? (row as ProductionBible) : null;
  },

  createOrUpdate(projectId: string, data: ProductionBibleData): ProductionBible {
    const existing = this.findByProjectId(projectId);
    const nextVersion = existing ? existing.version + 1 : 1;
    data.version = nextVersion;

    const characterRoster  = JSON.stringify(data.character_roster);
    const locationRoster   = JSON.stringify(data.location_roster);
    const objectRegistry   = JSON.stringify(data.object_registry);
    const visualStyleLock  = JSON.stringify(data.visual_style_lock);
    const rawJson          = JSON.stringify(data);

    if (existing) {
      db.prepare(`
        UPDATE production_bibles
        SET character_roster = ?, location_roster = ?, object_registry = ?,
            visual_style_lock = ?, raw_json = ?, version = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
      `).run(characterRoster, locationRoster, objectRegistry, visualStyleLock, rawJson, nextVersion, projectId);
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO production_bibles
          (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, projectId, characterRoster, locationRoster, objectRegistry, visualStyleLock, rawJson, nextVersion);
    }

    return this.findByProjectId(projectId)!;
  },
};
