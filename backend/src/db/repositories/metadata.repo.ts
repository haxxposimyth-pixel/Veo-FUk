import db from '../connection';
import type { VideoMetadata, VideoMetadataData } from 'shared';
import crypto from 'crypto';

export const VideoMetadataRepository = {
  findByProjectId(projectId: string): VideoMetadata | null {
    const row = db.prepare('SELECT * FROM video_metadata WHERE project_id = ?').get(projectId);
    return row ? (row as VideoMetadata) : null;
  },

  createOrUpdate(projectId: string, data: VideoMetadataData): VideoMetadata {
    const existing = this.findByProjectId(projectId);
    const rawJson = JSON.stringify(data);
    const chapters = JSON.stringify(data.chapters);
    const tags = JSON.stringify(data.tags);
    const hashtags = JSON.stringify(data.hashtags);
    const selectedTitle = existing ? existing.selected_title : (data.titles[0]?.text || null);

    const id = existing ? existing.id : crypto.randomUUID();

    db.prepare(`
      INSERT INTO video_metadata (id, project_id, raw_json, selected_title, description, chapters, tags, hashtags, thumbnail_hook)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        raw_json = excluded.raw_json,
        selected_title = COALESCE(video_metadata.selected_title, excluded.selected_title),
        description = excluded.description,
        chapters = excluded.chapters,
        tags = excluded.tags,
        hashtags = excluded.hashtags,
        thumbnail_hook = excluded.thumbnail_hook,
        created_at = datetime('now')
    `).run(
      id,
      projectId,
      rawJson,
      selectedTitle,
      data.description,
      chapters,
      tags,
      hashtags,
      data.thumbnail_hook
    );

    return this.findByProjectId(projectId)!;
  },

  updateFields(projectId: string, updates: Partial<Omit<VideoMetadata, 'id' | 'project_id' | 'created_at'>>): VideoMetadata | null {
    const existing = this.findByProjectId(projectId);
    if (!existing) return null;

    // Update raw_json as well with updated values
    let rawJsonObj: VideoMetadataData;
    try {
      rawJsonObj = JSON.parse(existing.raw_json);
    } catch (e) {
      rawJsonObj = {
        titles: [],
        description: '',
        chapters: [],
        tags: [],
        hashtags: [],
        thumbnail_hook: '',
      };
    }

    if (updates.selected_title !== undefined) {
      const exists = rawJsonObj.titles.some(t => t.text === updates.selected_title);
      if (!exists && updates.selected_title) {
        rawJsonObj.titles.unshift({
          text: updates.selected_title,
          structure_type: 'custom',
          char_count: updates.selected_title.length,
        });
      }
    }
    if (updates.description !== undefined) rawJsonObj.description = updates.description;
    if (updates.chapters !== undefined) {
      rawJsonObj.chapters = typeof updates.chapters === 'string' ? JSON.parse(updates.chapters) : updates.chapters;
    }
    if (updates.tags !== undefined) {
      rawJsonObj.tags = typeof updates.tags === 'string' ? JSON.parse(updates.tags) : updates.tags;
    }
    if (updates.hashtags !== undefined) {
      rawJsonObj.hashtags = typeof updates.hashtags === 'string' ? JSON.parse(updates.hashtags) : updates.hashtags;
    }
    if (updates.thumbnail_hook !== undefined) rawJsonObj.thumbnail_hook = updates.thumbnail_hook;

    const rawJsonStr = JSON.stringify(rawJsonObj);

    db.prepare(`
      UPDATE video_metadata
      SET selected_title = ?, description = ?, chapters = ?, tags = ?, hashtags = ?, thumbnail_hook = ?, raw_json = ?
      WHERE project_id = ?
    `).run(
      updates.selected_title !== undefined ? updates.selected_title : existing.selected_title,
      updates.description !== undefined ? updates.description : existing.description,
      updates.chapters !== undefined ? (typeof updates.chapters === 'string' ? updates.chapters : JSON.stringify(updates.chapters)) : existing.chapters,
      updates.tags !== undefined ? (typeof updates.tags === 'string' ? updates.tags : JSON.stringify(updates.tags)) : existing.tags,
      updates.hashtags !== undefined ? (typeof updates.hashtags === 'string' ? updates.hashtags : JSON.stringify(updates.hashtags)) : existing.hashtags,
      updates.thumbnail_hook !== undefined ? updates.thumbnail_hook : existing.thumbnail_hook,
      rawJsonStr,
      projectId
    );

    return this.findByProjectId(projectId);
  }
};
