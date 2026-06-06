/**
 * Per-shop webhook state for the Zapier push integration.
 *
 * Fully ISOLATED from the OAuth-based pull integration:
 *   - lib/google/oauth.ts owns Google OAuth + Sheets API pull
 *   - lib/sheetSync/store.ts owns sheet bindings used by the OAuth pull
 *   - lib/zapierSync/store.ts (this file) owns webhook secrets used by
 *     the Zapier push — completely orthogonal storage. A user can enable
 *     either, both, or neither; nothing here references OAuth tokens.
 *
 * Two Postgres keys per shop:
 *   - `zapier-webhook:<email>`       — the binding row (shopId, token,
 *                                      counters, last error). Source of truth.
 *   - `zapier-webhook-by-shop:<id>`  — reverse lookup so the public webhook
 *                                      route can resolve a shopId → email
 *                                      without scanning the kv.
 *
 * Token discipline (mirrors what the old Apps-Script webhook did):
 *   - 64-char hex token from crypto.randomBytes(32).
 *   - Verified in constant time on every webhook hit.
 *   - "Rotate" regenerates the token; old token is immediately invalid.
 *   - Exposed to the UI exactly ONCE on create/rotate; subsequent GETs
 *     never re-echo it.
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { kvDelete, kvGet, kvPut } from "@/lib/kv";

const norm = (email: string) => email.trim().toLowerCase();
const stateKey = (email: string) => `zapier-webhook:${norm(email)}`;
const reverseKey = (shopId: string) => `zapier-webhook-by-shop:${shopId}`;

export interface ZapierWebhookState {
  /** Opaque, random, URL-safe handle. NEVER tied to the email. */
  shopId: string;
  /** 64-char hex secret. Verified per webhook hit. */
  token: string;
  createdAt: number;
  /** ms epoch — last successful webhook push. 0 = never. */
  lastPushAt: number;
  /** Running total of rows ever received via this webhook. */
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

/** Public-safe slice — surfaced to the dashboard. Token never included. */
export interface ZapierWebhookPublic {
  shopId: string;
  createdAt: number;
  lastPushAt: number;
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

function newId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function publicShape(s: ZapierWebhookState): ZapierWebhookPublic {
  return {
    shopId: s.shopId,
    createdAt: s.createdAt,
    lastPushAt: s.lastPushAt,
    totalRowsEver: s.totalRowsEver,
    lastError: s.lastError,
    lastErrorAt: s.lastErrorAt,
  };
}

export async function getWebhookState(email: string): Promise<ZapierWebhookState | null> {
  return (await kvGet<ZapierWebhookState>(stateKey(email))) ?? null;
}

export async function getWebhookPublic(email: string): Promise<ZapierWebhookPublic | null> {
  const s = await getWebhookState(email);
  return s ? publicShape(s) : null;
}

export interface WebhookCredentials {
  shopId: string;
  token: string;
  /** Convenience for the UI — same as `${origin}/api/zapier/webhook/${shopId}?token=${token}` */
  webhookUrl: string;
}

/**
 * Create a brand-new webhook OR rotate the existing one's token. Always
 * returns the full token + URL — caller must show it to the user and warn
 * "save this now, we won't re-surface it." Preserves the shopId on rotation
 * so an Apps Script / Zap that pinned the shopId still works after a fresh
 * paste of the new token.
 */
export async function createOrRotateWebhook(
  email: string,
  baseUrl: string,
): Promise<WebhookCredentials> {
  const existing = await getWebhookState(email);
  const shopId = existing?.shopId ?? newId(12); // 24 hex chars
  const token = newId(32); // 64 hex chars
  const next: ZapierWebhookState = existing
    ? { ...existing, token, lastError: undefined, lastErrorAt: undefined }
    : {
        shopId,
        token,
        createdAt: Date.now(),
        lastPushAt: 0,
        totalRowsEver: 0,
      };
  await kvPut(stateKey(email), next);
  // Reverse lookup is idempotent on the shopId.
  await kvPut(reverseKey(shopId), { email: norm(email) });
  const trimmed = baseUrl.replace(/\/+$/, "");
  return {
    shopId,
    token,
    webhookUrl: `${trimmed}/api/zapier/webhook/${shopId}?token=${token}`,
  };
}

export async function disableWebhook(email: string): Promise<void> {
  const s = await getWebhookState(email);
  if (!s) return;
  await kvDelete(stateKey(email));
  await kvDelete(reverseKey(s.shopId));
}

interface ReverseRecord {
  email: string;
}

/**
 * Resolve shopId → email, then verify the provided token in constant
 * time. Returns the email on success; null on any failure.
 *
 * The pair (shopId, token) IS the credential — no session cookie possible
 * because Zapier's servers have no session. That's why this lookup uses
 * timingSafeEqual: without it, an attacker could brute-force the token
 * byte-by-byte by measuring response latency.
 */
export async function authenticateWebhook(
  shopId: string,
  token: string,
): Promise<string | null> {
  if (!shopId || !token) return null;
  const reverse = await kvGet<ReverseRecord>(reverseKey(shopId));
  const email = reverse?.email?.trim()?.toLowerCase();
  if (!email) return null;
  const state = await getWebhookState(email);
  if (!state) return null;
  const a = Buffer.from(state.token, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return email;
}

export async function recordWebhookPush(email: string, rowsThisPush: number): Promise<void> {
  const s = await getWebhookState(email);
  if (!s) return;
  await kvPut(stateKey(email), {
    ...s,
    lastPushAt: Date.now(),
    totalRowsEver: s.totalRowsEver + Math.max(0, rowsThisPush),
    lastError: undefined,
    lastErrorAt: undefined,
  } satisfies ZapierWebhookState);
}

export async function recordWebhookError(email: string, message: string): Promise<void> {
  const s = await getWebhookState(email);
  if (!s) return;
  await kvPut(stateKey(email), {
    ...s,
    lastError: message.slice(0, 500),
    lastErrorAt: Date.now(),
  } satisfies ZapierWebhookState);
}
