import db from '../connection';
import type { StoryPlan, StoryPlanData, StoryPlanItem } from 'shared';
import crypto from 'crypto';

export interface ParsedStoryPlan extends Omit<StoryPlan, 'character_list' | 'location_list' | 'object_list' | 'approved'> {
  character_list: StoryPlanItem[];
  location_list: StoryPlanItem[];
  object_list: StoryPlanItem[];
  approved: boolean;
}

export const StoryPlanRepository = {

  findByProjectId(projectId: string): ParsedStoryPlan | null {
    const row = db.prepare('SELECT * FROM story_plans WHERE project_id = ?').get(projectId);
    if (!row) return null;
    
    const r = row as any;
    return {
      id: r.id,
      project_id: r.project_id,
      story_outline: r.story_outline,
      character_list: r.character_list ? JSON.parse(r.character_list) : [],
      location_list: r.location_list ? JSON.parse(r.location_list) : [],
      object_list: r.object_list ? JSON.parse(r.object_list) : [],
      video_type: r.video_type || 'documentary',
      approved: r.approved === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  },

  createOrUpdate(projectId: string, data: StoryPlanData): ParsedStoryPlan {
    const existing = this.findByProjectId(projectId);
    const characterList = JSON.stringify(data.character_list || []);
    const locationList  = JSON.stringify(data.location_list || []);
    const objectList    = JSON.stringify(data.object_list || []);

    if (existing) {
      db.prepare(`
        UPDATE story_plans
        SET story_outline = ?, character_list = ?, location_list = ?, object_list = ?,
            video_type = ?, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
      `).run(
        data.story_outline,
        characterList,
        locationList,
        objectList,
        data.video_type || 'documentary',
        projectId
      );
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO story_plans
          (id, project_id, story_outline, character_list, location_list, object_list,
           video_type, approved)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        id,
        projectId,
        data.story_outline,
        characterList,
        locationList,
        objectList,
        data.video_type || 'documentary'
      );
    }

    return this.findByProjectId(projectId)!;
  },

  approvePlan(projectId: string, approved: boolean): ParsedStoryPlan | null {
    const val = approved ? 1 : 0;
    db.prepare('UPDATE story_plans SET approved = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
      .run(val, projectId);
    return this.findByProjectId(projectId);
  }
};
