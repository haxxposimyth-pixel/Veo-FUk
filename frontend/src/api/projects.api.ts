import { request } from './client';
import type { Project } from 'shared';

export const projectsApi = {
  getProjects() {
    return request<Project[]>('/projects');
  },

  getProject(id: string) {
    return request<Project>(`/projects/${id}`);
  },

  createProject(data: { title: string; topic: string; visual_style: string; narration_language: string; region?: string; aspect_ratio: string; youtube_transcript?: string | null; content_type?: string; content_profile?: string; concept_brief?: string | null; style_id?: string | null }) {
    return request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProject(id: string, data: Partial<Project>) {
    return request<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteProject(id: string) {
    return request<{ id: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  },

  getStatus(id: string) {
    return request<{ status: string }>(`/projects/${id}/status`);
  },

  duplicateProject(id: string) {
    return request<Project>(`/projects/${id}/duplicate`, {
      method: 'POST',
    });
  },

  getIntegrity(id: string) {
    return request<any>(`/projects/${id}/integrity`);
  },

  getUsage(id: string) {
    return request<any>(`/projects/${id}/usage`);
  },

  generateConcept(data: { title: string; language?: string; region?: string; audience?: string; length?: string; content_profile?: string; content_type?: string }) {
    return request<any>('/concept/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  regenerateConceptTopic(data: { title: string; chosenTitle: string; language?: string; region?: string; audience?: string; current_content_type?: string; content_profile?: string; content_type?: string }) {
    return request<any>('/concept/regenerate-topic', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
