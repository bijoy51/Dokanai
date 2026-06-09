import { kvConfigured, kvGet, kvPut } from "@/lib/kv";

/**
 * Per-account fixed-window rate limiter, backed by the existing Postgres KV.
 *
 * Why fixed window (not sliding / token-bucket):
 *   - One KV read + one KV write per request → minimal latency overhead
 *     on the hot path. We already pay these round-trips elsewhere in
 *     every authed request.
 *   - A small read-then-write race within the same window is acceptable
 *     for an abuse ceiling; the limit is a guardrail, not a transaction.
 *   - Old window keys orphan harmlessly — they're tiny JSON ints and KV
 *     doesn't have TTL on Postgres, but the disk cost is negligible.
 *
 * Fail-open in dev:
 *   - When `kvConfigured()` is false (no POSTGRES_URL / ML backend), every
 *     call is allowed. Local development stays friction-free; production
 *     deploys (where Postgres is always set) enforce the limits.
 *
 * The bucket name is part of the key, so two limits on the same account
 * (e.g. per-minute + per-hour on the same endpoint) get independent
 * counters and never interfere.
 */
export interface RateLimitResult {
  ok: boolean;
  /** Remaining requests in this window after the current one. */
  remaining: number;
  /** Unix ms when the current window ends and the counter resets. */
  resetAt: number;
  /** Seconds the caller should wait before retrying (0 if ok). */
  retryAfterSec: number;
}

export async function consumeQuota(
  bucket: string,
  subject: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (!kvConfigured() || limit <= 0) {
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: 0, retryAfterSec: 0 };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSec);
  const resetAt = (windowStart + windowSec) * 1000;
  const key = `rate:${bucket}:${subject}:${windowStart}`;

  let count = 0;
  try {
    const current = await kvGet<number>(key);
    if (typeof current === "number" && Number.isFinite(current)) count = current;
  } catch {
    // KV down → fail open so a Postgres blip doesn't lock real users out.
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt, retryAfterSec: 0 };
  }

  if (count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  }

  try {
    await kvPut(key, count + 1);
  } catch {
    // Best-effort: if the write fails we still let the request through.
  }
  return { ok: true, remaining: Math.max(0, limit - count - 1), resetAt, retryAfterSec: 0 };
}

/** Attach standard `X-RateLimit-*` + `Retry-After` headers to a Response. */
export function rateLimitHeaders(r: RateLimitResult, limit: number): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(r.remaining),
  };
  if (r.resetAt > 0) {
    h["X-RateLimit-Reset"] = String(Math.floor(r.resetAt / 1000));
  }
  if (!r.ok && r.retryAfterSec > 0) {
    h["Retry-After"] = String(r.retryAfterSec);
  }
  return h;
}
