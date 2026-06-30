import db from '../connection';
import type { Project, ProjectStatus } from 'shared';
import { cleanTopicScaffolding } from 'shared';
import crypto from 'crypto';

export const ProjectRepository = {

  findAll(): Project[] {
    const rows = db.prepare(`
      SELECT p.*, EXISTS(SELECT 1 FROM video_metadata vm WHERE vm.project_id = p.id) as has_metadata
      FROM projects p
      ORDER BY p.created_at DESC
    `).all();
    return rows.map((row: any) => {
      if (row.movie_config) {
        try {
          row.movie_config = JSON.parse(row.movie_config);
        } catch (e) {
          row.movie_config = undefined;
        }
      } else {
        row.movie_config = undefined;
      }
      return row as Project;
    });
  },

  findById(id: string): Project | null {
    const row = db.prepare(`
      SELECT p.*, EXISTS(SELECT 1 FROM video_metadata vm WHERE vm.project_id = p.id) as has_metadata
      FROM projects p
      WHERE p.id = ?
    `).get(id);
    if (!row) return null;
    const project = row as any;
    if (project.movie_config) {
      try {
        project.movie_config = JSON.parse(project.movie_config);
      } catch (e) {
        project.movie_config = undefined;
      }
    } else {
      project.movie_config = undefined;
    }
    return project as Project;
  },

  create(input: Omit<Project, 'id' | 'status' | 'created_at' | 'updated_at'>): Project {
    const id = crypto.randomUUID();
    const status: ProjectStatus = 'setup';
    const cleanedTopic = cleanTopicScaffolding(input.topic);
    db.prepare(`
      INSERT INTO projects (id, title, topic, visual_style, narration_language, region, aspect_ratio, status, youtube_transcript, content_type, concept_brief, style_id, target_duration_minutes, content_profile, movie_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title,
      cleanedTopic,
      input.visual_style,
      input.narration_language,
      input.region || 'auto',
      input.aspect_ratio,
      status,
      input.youtube_transcript || null,
      input.content_type || 'auto',
      input.concept_brief || null,
      input.style_id || null,
      (input as any).target_duration_minutes ?? 8,
      (input as any).content_profile || 'viral_story',
      input.movie_config ? JSON.stringify(input.movie_config) : null
    );
    return this.findById(id)!;
  },

  update(id: string, updates: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>): Project | null {
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.topic !== undefined) {
      cleanedUpdates.topic = cleanTopicScaffolding(cleanedUpdates.topic);
    }
    const keys = Object.keys(cleanedUpdates);
    if (!keys.length) return this.findById(id);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => {
      const val = (cleanedUpdates as Record<string, unknown>)[k];
      if (k === 'movie_config') {
        return val ? JSON.stringify(val) : null;
      }
      return val;
    });
    db.prepare(`UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
    return this.findById(id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  },

  updateStatus(id: string, status: ProjectStatus): void {
    db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  },

  duplicate(id: string): Project | null {
    const original = this.findById(id);
    if (!original) return null;

    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO projects (id, title, topic, visual_style, narration_language, region, aspect_ratio, status, youtube_transcript, style_id, content_type, concept_brief, target_duration_minutes, content_profile, movie_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'bible', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      `${original.title} (Copy)`,
      original.topic,
      original.visual_style,
      original.narration_language,
      original.region || 'auto',
      original.aspect_ratio,
      original.youtube_transcript || null,
      (original as any).style_id || null,
      original.content_type || 'auto',
      original.concept_brief || null,
      (original as any).target_duration_minutes ?? 8,
      (original as any).content_profile || 'viral_story',
      original.movie_config ? JSON.stringify(original.movie_config) : null
    );

    // Duplicate production bible if exists
    const bible = db.prepare('SELECT * FROM production_bibles WHERE project_id = ?').get(id) as any;
    if (bible) {
      const newBibleId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO production_bibles (id, project_id, character_roster, location_roster, object_registry, visual_style_lock, raw_json, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        newBibleId,
        newId,
        bible.character_roster,
        bible.location_roster,
        bible.object_registry,
        bible.visual_style_lock,
        bible.raw_json
      );
    }

    return this.findById(newId);
  },
};
