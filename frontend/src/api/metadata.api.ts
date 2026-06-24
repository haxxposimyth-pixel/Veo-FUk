import { request } from './client';
import type { VideoMetadata } from 'shared';

export const metadataApi = {
  getMetadata(projectId: string) {
    return request<VideoMetadata>(`/projects/${projectId}/metadata`);
  },

  generateMetadata(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/metadata/generate`, {
      method: 'POST',
    });
  },

  updateMetadata(projectId: string, data: any) {
    return request<VideoMetadata>(`/projects/${projectId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  regenerateTitles(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/metadata/regenerate-titles`, {
      method: 'POST',
    });
  },
};
