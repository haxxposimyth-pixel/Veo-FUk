import { request } from './client';
import type { Scene, SceneItem } from 'shared';

export const scenesApi = {
  getScenes(projectId: string) {
    return request<Scene[]>(`/projects/${projectId}/scenes`);
  },

  getScenesByPhase(projectId: string, phaseNumber: number) {
    return request<Scene[]>(`/projects/${projectId}/scenes/${phaseNumber}`);
  },

  generateScenes(projectId: string, data: { phaseNumber: number; sceneCountTarget?: number; regenerate?: boolean }) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/scenes/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateScene(projectId: string, sceneId: string, data: SceneItem) {
    return request<{ success: boolean; message: string; data: SceneItem }>(`/projects/${projectId}/scenes/${sceneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  regenerateScene(projectId: string, sceneId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/scenes/${sceneId}/regenerate`, {
      method: 'POST',
    });
  },

  retryPhase(projectId: string, phaseNumber: number) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/phases/${phaseNumber}/retry`, {
      method: 'POST',
    });
  },

  repairContinuity(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/scenes/repair-continuity`, {
      method: 'POST',
    });
  },
};
