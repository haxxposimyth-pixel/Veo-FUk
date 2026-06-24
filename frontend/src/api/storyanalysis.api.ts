import { request } from './client';
import type { StoryAnalysisData } from 'shared';

export const storyAnalysisApi = {
  getStoryAnalysis(projectId: string) {
    return request<StoryAnalysisData>(`/projects/${projectId}/story-analysis`);
  },

  generateStoryAnalysis(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/story-analysis/generate`, {
      method: 'POST',
    });
  },
};
