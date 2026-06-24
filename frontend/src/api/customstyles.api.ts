import { request } from './client';
import type { CustomStyle } from 'shared';

export const customStylesApi = {
  getAll: () => request<CustomStyle[]>('/custom-styles'),
  create: (name: string, description: string, render_family?: string) =>
    request<CustomStyle>('/custom-styles', {
      method: 'POST',
      body: JSON.stringify({ name, description, render_family }),
    }),
  update: (id: string, name: string, description: string, render_family?: string) =>
    request<CustomStyle>(`/custom-styles/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, render_family }),
    }),
  delete: (id: string) =>
    request<void>(`/custom-styles/${id}`, { method: 'DELETE' }),
};

