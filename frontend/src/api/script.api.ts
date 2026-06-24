import { request } from './client';
import type { Script, Phase, ScriptTone } from 'shared';

export const scriptApi = {
  getScript(projectId: string) {
    return request<Script>(`/projects/${projectId}/script`);
  },

  getPhases(projectId: string) {
    return request<Phase[]>(`/projects/${projectId}/script/phases`);
  },

  getHookScore(projectId: string, rescore = false) {
    return request<{ hook_score: number | null; hook_score_breakdown: any | null; hook_score_passed: number | null }>(
      `/projects/${projectId}/script/phases/1/hook-score${rescore ? '?rescore=true' : ''}`
    );
  },

  generateScript(projectId: string, scriptTone?: ScriptTone) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/script/generate`, {
      method: 'POST',
      body: JSON.stringify({ scriptTone }),
    });
  },

  approveScript(projectId: string, approved: boolean) {
    return request<{ approved: boolean; warnings?: string[] }>(`/projects/${projectId}/script/approve`, {
      method: 'PUT',
      body: JSON.stringify({ approved }),
    });
  },

  updatePhase(
    projectId: string,
    phaseNumber: number,
    data: { title: string; content: string; narration_text?: string; narration_word_count?: number }
  ) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/script/phases/${phaseNumber}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  regeneratePhase(projectId: string, phaseNumber: number, scriptTone?: ScriptTone) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/script/phases/${phaseNumber}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ scriptTone }),
    });
  },

  regenerateWithSuggestions(projectId: string, scriptTone?: ScriptTone) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/script/phases/1/regenerate-with-suggestions`, {
      method: 'POST',
      body: JSON.stringify({ scriptTone }),
    });
  },
};
