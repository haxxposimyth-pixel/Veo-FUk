export const exportApi = {
  async exportProject(projectId: string, format: 'json' | 'markdown' | 'txt' | 'csv', include: string[]): Promise<Blob> {
    const res = await fetch(`/api/v1/projects/${projectId}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format, include }),
    });

    if (!res.ok) {
      let errorMsg = 'Failed to export project package';
      try {
        const errorJson = await res.json();
        errorMsg = errorJson.error || errorMsg;
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    return await res.blob();
  },
};
