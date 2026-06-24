import { request } from './client';
import type { ContinuityWarning } from 'shared';

export const continuityApi = {
  getWarnings: (projectId: string) => 
    request<ContinuityWarning[]>(`/projects/${projectId}/continuity-warnings`),
  
  resolveWarning: (projectId: string, warningId: string, resolved: boolean) => 
    request<{ success: boolean; message: string }>(`/projects/${projectId}/continuity-warnings/${warningId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolved })
    }),

  scanAll: (projectId: string) =>
    request<{ warnings_found: number; inserted: number }>(`/projects/${projectId}/continuity/scan-all`, {
      method: 'POST'
    }),

  fixWarning: (projectId: string, warningId: string) =>
    request<{ success: boolean; message: string; data: any }>(`/projects/${projectId}/continuity-warnings/${warningId}/fix`, {
      method: 'POST'
    })
};
