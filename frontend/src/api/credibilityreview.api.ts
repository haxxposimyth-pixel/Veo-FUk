import { request } from './client';
import type { CredibilityReviewData } from 'shared';

export const credibilityReviewApi = {
  getCredibilityReview(projectId: string) {
    return request<CredibilityReviewData>(`/projects/${projectId}/credibility-review`);
  },

  generateCredibilityReview(projectId: string) {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/credibility-review/generate`, {
      method: 'POST',
    });
  },

  applyCredibilityFix(projectId: string, phaseNumber: number, issues: any[]) {
    return request<{ success: boolean; phase: any; warnings: string[] }>(
      `/projects/${projectId}/script/phases/${phaseNumber}/apply-credibility-fix`,
      {
        method: 'POST',
        body: JSON.stringify({ issues }),
      }
    );
  },

  applyAllCredibilityFixes(projectId: string) {
    return request<{ success: boolean; review: any }>(
      `/projects/${projectId}/script/apply-all-credibility-fixes`,
      {
        method: 'POST',
      }
    );
  },
};
