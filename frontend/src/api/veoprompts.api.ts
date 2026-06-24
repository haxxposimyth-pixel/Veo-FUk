import { request } from './client';
import type { VeoPrompt, VeoPromptData } from 'shared';

export const veoPromptsApi = {
  getPrompts(projectId: string) {
    return request<VeoPrompt[]>(`/projects/${projectId}/prompts`);
  },

  generatePrompt(projectId: string, data: { sceneId?: string; phaseNumber?: number; regenerate?: boolean }) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePrompt(projectId: string, promptId: string, data: VeoPromptData) {
    return request<{ success: boolean; message: string; data: VeoPromptData }>(`/projects/${projectId}/veo-prompts/${promptId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateManualPrompt(projectId: string, promptId: string, data: Partial<VeoPromptData>) {
    return request<{ prompt: VeoPrompt; violations: any[] }>(`/projects/${projectId}/prompts/${promptId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  regeneratePrompt(projectId: string, promptId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/veo-prompts/${promptId}/regenerate`, {
      method: 'POST',
    });
  },
};
