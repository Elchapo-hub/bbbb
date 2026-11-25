// In-memory auth bearer token (never persisted in localStorage/sessionStorage per security policy)
let memoryAuthToken: string | null = null;
let guestCartSessionId = `sess-${Math.random().toString(36).slice(2, 12)}`;

export function setAuthToken(token: string | null) {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'x-cart-session': guestCartSessionId,
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (memoryAuthToken) {
    headers.Authorization = `Bearer ${memoryAuthToken}`;
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || 'Unexpected server response' };
  }

  if (!res.ok) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }

  return data as T;
}
