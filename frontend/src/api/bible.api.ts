import { request } from './client';
import type { ProductionBibleData } from 'shared';

export const bibleApi = {
  getBible(projectId: string) {
    return request<ProductionBibleData>(`/projects/${projectId}/bible`);
  },

  updateBible(projectId: string, data: ProductionBibleData) {
    return request<ProductionBibleData>(`/projects/${projectId}/bible`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  generateBible(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/bible/generate`, {
      method: 'POST',
    });
  },

  regenerateBible(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/bible/regenerate`, {
      method: 'POST',
    });
  },

  repairObjects(projectId: string) {
    return request<{ success: boolean; addedCount: number; addedNames: string[]; updatedCount: number }>(`/projects/${projectId}/bible/repair-objects`, {
      method: 'POST',
    });
  },
};
