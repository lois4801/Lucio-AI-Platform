// Thin API client — all calls go through the Vite proxy to the Lucio API
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  // Diagnostic-first parsing (publishing repair runbook §5): never blind-parse
  // JSON. An HTML body (SPA fallback, 404 page, login redirect, provider error)
  // must produce a readable diagnostic, not "Unexpected token '<'".
  if (!contentType.includes('application/json')) {
    throw new ApiError(res.status,
      `Expected JSON but received ${contentType || 'an unknown content type'} (HTTP ${res.status}) at ${res.url}. ` +
      `Body: ${text.slice(0, 240)}`);
  }
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

export type User = { id: string; email: string; name: string; role: 'owner' | 'admin' | 'member' | 'viewer'; orgId: string };
export type Project = { id: string; name: string; description?: string; kind: string; status: string; created_at: string; updated_at: string };
export type Plan = {
  goal: string; siteName: string; tagline: string; industry: string; location: string; tone: string;
  palette: Record<string, string>; services: string[]; about: string; features: string[]; pages: string[];
  seo: { title: string; description: string };
  parsed: { businessName: string | null; industry: string; location: string; features: string[]; tone: string };
};
