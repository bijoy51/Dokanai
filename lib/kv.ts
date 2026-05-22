/**
 * Thin client for the ML backend's shared key-value store (the /kv/{key}
 * endpoints in ml-backend/app/main.py).
 *
 * The backend is a single always-on container, so this KV is consistent across
 * every Vercel serverless instance and survives their cold starts — the one
 * piece of durable state available without a real database. Used to persist
 * accounts (lib/users.ts) and imported shop data (lib/data/imported.ts).
 *
 * Configure with:
 *   - ML_BACKEND_URL    backend base URL (already used by analyze-shop)
 *   - ML_ADMIN_SECRET   must equal the backend's ADMIN_SECRET
 *
 * When unconfigured (e.g. local dev) every call is a no-op returning null/false
 * so callers transparently fall back to their in-memory behaviour.
 */

const KV_TIMEOUT_MS = 12_000;

function kvConfig(): { base: string; secret: string } | null {
  const url = process.env.ML_BACKEND_URL?.trim();
  const secret = (process.env.ML_ADMIN_SECRET || process.env.ADMIN_SECRET || "").trim();
  if (!url || !secret) return null;
  const base = url.replace(/\s+/g, "").replace(/\/+$/, "");
  return { base, secret };
}

export function kvConfigured(): boolean {
  return kvConfig() !== null;
}

/** GET a value. Returns null on miss, unconfigured, or any error. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      headers: { "x-admin-secret": cfg.secret },
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** PUT a JSON-object value. Returns true on success. */
export async function kvPut(key: string, value: unknown): Promise<boolean> {
  const cfg = kvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": cfg.secret },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** DELETE a key. Returns true on success. */
export async function kvDelete(key: string): Promise<boolean> {
  const cfg = kvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { "x-admin-secret": cfg.secret },
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
