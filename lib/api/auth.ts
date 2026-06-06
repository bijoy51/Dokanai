/**
 * Auth + rate limit shared by every /api/v1/* endpoint.
 *
 * Usage in a route:
 *   const ctx = await requireApiKey(req, { needs: "read" });
 *   if ("error" in ctx) return ctx.error;
 *   // ctx.email and ctx.scope are now safe to use
 *
 * Two layers:
 *   1. Bearer token resolution + scope check.
 *   2. Per-shop daily rate limit. 10,000 calls / 24h per shop. Counter
 *      lives in Postgres so it survives serverless cold starts.
 *
 * Rate-limit philosophy: we don't try to be a perfect rate limiter. A
 * single daily ceiling is enough to stop a runaway loop from burning the
 * Vercel function budget overnight. Real abuse mitigation (per-IP,
 * burst control) would need Redis; out of scope for v1.
 */

import { NextResponse } from "next/server";
import { kvGet, kvPut } from "@/lib/kv";
import {
  resolveSecret,
  stampLastUsed,
  type ApiKeyRecord,
  type ApiKeyScope,
} from "@/lib/apiKeys/store";

const DAILY_LIMIT = 10_000;
const usageKey = (email: string) => `api-usage:${email.trim().toLowerCase()}`;

export interface ApiCallContext {
  email: string;
  scope: ApiKeyScope;
  keyId: string;
}
export interface ApiCallRejection {
  error: NextResponse;
}

interface UsageRecord {
  /** Calendar day key in UTC, e.g. "2026-06-06". */
  day: string;
  /** Calls made in the current `day` window. */
  count: number;
  /** Cumulative all-time count for the /usage endpoint. */
  totalEver: number;
  lastCallAt?: number;
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { error: message, code: "unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer realm=\"DokanAI API\"" } },
  );
}
function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message, code: "forbidden" }, { status: 403 });
}
function tooMany(remaining: number, resetAtIso: string): NextResponse {
  return NextResponse.json(
    {
      error: `Daily rate limit reached (${DAILY_LIMIT} requests). Resets at ${resetAtIso} UTC.`,
      code: "rate_limited",
      limit: DAILY_LIMIT,
      remaining,
      resetAt: resetAtIso,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(DAILY_LIMIT),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resetAtIso,
        "Retry-After": String(Math.max(1, Math.floor(secondsUntilUtcMidnight()))),
      },
    },
  );
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return (tomorrow.getTime() - now.getTime()) / 1000;
}

function tomorrowUtcMidnightIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

/**
 * Pull `Authorization: Bearer …` from the request and resolve it to an
 * account + scope. Returns either an ApiCallContext (success) or an
 * ApiCallRejection (carries the NextResponse the route should return).
 *
 * `needs` declares what scope the caller's endpoint needs:
 *   - "read"        → key must have scope "read" or "read+write"
 *   - "write"       → key must have scope "write" or "read+write"
 *   - "any"         → just authenticated; no scope check (use for /health, /usage)
 */
export async function requireApiKey(
  req: Request,
  opts: { needs: "read" | "write" | "any" },
): Promise<ApiCallContext | ApiCallRejection> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return {
      error: unauthorized(
        "Missing Authorization header. Send `Authorization: Bearer sk_live_…`.",
      ),
    };
  }
  const secret = m[1];
  let record: ApiKeyRecord | null;
  try {
    record = await resolveSecret(secret);
  } catch {
    return { error: unauthorized("API key lookup failed.") };
  }
  if (!record) {
    return { error: unauthorized("Invalid or revoked API key.") };
  }
  if (!scopeAllows(record.scope, opts.needs)) {
    return {
      error: forbidden(
        `This key has scope "${record.scope}" — endpoint requires "${opts.needs}".`,
      ),
    };
  }

  // ---- rate limit ----
  const today = todayUtcKey();
  const usage = (await kvGet<UsageRecord>(usageKey(record.email))) ?? {
    day: today,
    count: 0,
    totalEver: 0,
  };
  if (usage.day !== today) {
    usage.day = today;
    usage.count = 0;
  }
  if (usage.count >= DAILY_LIMIT) {
    return { error: tooMany(0, tomorrowUtcMidnightIso()) };
  }
  usage.count += 1;
  usage.totalEver += 1;
  usage.lastCallAt = Date.now();
  // Best-effort write — a failed write doesn't fail the API call.
  await kvPut(usageKey(record.email), usage).catch(() => {});

  // Stamp lastUsedAt on the key (also best-effort).
  await stampLastUsed(record.keyId).catch(() => {});

  return {
    email: record.email,
    scope: record.scope,
    keyId: record.keyId,
  };
}

function scopeAllows(have: ApiKeyScope, needs: "read" | "write" | "any"): boolean {
  if (needs === "any") return true;
  if (have === "read+write") return true;
  return have === needs;
}

/**
 * Read-only accessor used by the /api/v1/usage endpoint. Doesn't mutate.
 */
export async function readUsageFor(email: string): Promise<UsageRecord | null> {
  return (await kvGet<UsageRecord>(usageKey(email))) ?? null;
}

export const RATE_LIMIT_DAILY = DAILY_LIMIT;
