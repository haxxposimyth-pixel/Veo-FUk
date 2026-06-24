import { request } from './client';
import type { StoryPlanData } from 'shared';

export const storyPlanApi = {
  getStoryPlan(projectId: string) {
    return request<StoryPlanData>(`/projects/${projectId}/storyplan`);
  },

  updateStoryPlan(projectId: string, data: StoryPlanData) {
    return request<StoryPlanData>(`/projects/${projectId}/storyplan`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  generateStoryPlan(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/storyplan/generate`, {
      method: 'POST',
    });
  },

  approveStoryPlan(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/storyplan/approve`, {
      method: 'POST',
    });
  },
};
