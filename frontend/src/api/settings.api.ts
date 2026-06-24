import { request } from './client';
import type { ApiSettings, ModelUsage } from 'shared';

export interface SettingsWithStats extends ApiSettings {
  stats: {
    projectCount: number;
    totalPrompts: number;
    dbSize: string;
    modelUsage?: ModelUsage;
    allModelUsages?: Record<string, ModelUsage>;
  };
}

export const settingsApi = {
  getSettings() {
    return request<SettingsWithStats>('/settings');
  },

  updateSettings(data: Partial<ApiSettings>) {
    return request<SettingsWithStats>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  validateKey(apiKey: string, provider?: 'gemini' | 'highway' | 'third-party', baseUrl?: string) {
    return request<{ success: boolean; message: string }>('/settings/validate-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey, provider, baseUrl }),
    });
  },

  getAgentLogs(limit = 50) {
    return request<any[]>(`/settings/agent-logs?limit=${limit}`);
  },

  getAvailableModels() {
    return request<Array<{ value: string; label: string }>>('/settings/available-models');
  },

  testModel(model: string, apiKey?: string) {
    return request<{ success: boolean; latency: number; error?: string }>('/settings/test-model', {
      method: 'POST',
      body: JSON.stringify({ model, apiKey }),
    });
  },

  validateAllKeys() {
    return request<{ success: boolean; keyStatuses: any[]; data: SettingsWithStats }>('/settings/keys/validate', {
      method: 'POST',
    });
  },

  removeDeadKeys() {
    return request<{ success: boolean; keyStatuses: any[]; data: SettingsWithStats }>('/settings/keys/remove-dead', {
      method: 'POST',
    });
  },
};
