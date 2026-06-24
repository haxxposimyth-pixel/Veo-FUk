export class ApiError extends Error {
  status: number;
  reason?: string;
  active_phase?: string | number;
  integrity?: any;

  constructor(message: string, status: number, reason?: string, active_phase?: string | number, integrity?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
    this.active_phase = active_phase;
    this.integrity = integrity;
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorData: any;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'Unknown server error' };
    }
    const errMsg = errorData.error || 'Request failed';
    throw new ApiError(errMsg, res.status, errorData.reason, errorData.active_phase, errorData.integrity);
  }

  if (res.status === 204) {
    return {} as T;
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}
