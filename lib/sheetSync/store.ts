/**
 * Per-account state for the "Live Sync from Google Sheets" feature.
 *
 * Two KV keys per shop:
 *   - `sheet-sync:<email>`       — full state object (token, shopId,
 *                                  counters, last error). Source of truth.
 *   - `sheet-sync-by-shop:<id>`  — reverse lookup so the public webhook
 *                                  route can resolve a shopId → email
 *                                  without scanning every account.
 *
 * Why a shopId at all (vs putting the email in the URL): emails leak who
 * the shop owner is. shopId is a random opaque handle that's safe to put
 * in a URL the user pastes into a Google Apps Script.
 *
 * Token discipline:
 *   - Generated server-side via crypto.randomBytes(32) → 64 hex chars.
 *   - Compared in constant time on webhook hits.
 *   - "Rotate" replaces it (old token immediately invalid). Useful if
 *     the user leaks the URL into a screenshot or a public repo.
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { kvDelete, kvGet, kvPut } from "@/lib/kv";

const norm = (email: string) => email.trim().toLowerCase();
const stateKey = (email: string) => `sheet-sync:${norm(email)}`;
const reverseKey = (shopId: string) => `sheet-sync-by-shop:${shopId}`;

export interface SheetSyncState {
  /** Opaque, random, URL-safe handle. NEVER tied to the email. */
  shopId: string;
  /** 64-char hex secret. Verified per webhook hit. */
  token: string;
  /** ms epoch — when the connection was first set up. */
  createdAt: number;
  /** ms epoch — last successful webhook push. 0 = never. */
  lastSyncAt: number;
  /** Running total of rows ever received from this shop. */
  totalRowsEver: number;
  /** Most recent error message from a failed webhook hit, for the UI. */
  lastError?: string;
  /** ms epoch — when the most recent error happened. */
  lastErrorAt?: number;
}

/** Public-safe slice surfaced to the connected UI. The full state never
 *  leaves the server — callers only ever see the webhook URL once, when
 *  they create or rotate the connection. */
export interface SheetSyncPublic {
  shopId: string;
  createdAt: number;
  lastSyncAt: number;
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

function newId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function publicShape(s: SheetSyncState): SheetSyncPublic {
  return {
    shopId: s.shopId,
    createdAt: s.createdAt,
    lastSyncAt: s.lastSyncAt,
    totalRowsEver: s.totalRowsEver,
    lastError: s.lastError,
    lastErrorAt: s.lastErrorAt,
  };
}

export async function getSyncState(email: string): Promise<SheetSyncState | null> {
  return (await kvGet<SheetSyncState>(stateKey(email))) ?? null;
}

export async function getSyncPublic(email: string): Promise<SheetSyncPublic | null> {
  const s = await getSyncState(email);
  return s ? publicShape(s) : null;
}

/**
 * Create a brand-new connection OR rotate the existing one's token.
 * Always returns the full token + URL — caller must show it to the user
 * and tell them to paste it; we won't re-surface it on subsequent GETs.
 */
export interface ConnectionCredentials {
  shopId: string;
  token: string;
  /** Helper for the UI — same as ${baseUrl}/api/import/webhook/${shopId}?token=${token} */
  webhookUrl: string;
}

export async function createOrRotate(email: string, baseUrl: string): Promise<ConnectionCredentials> {
  const existing = await getSyncState(email);
  const shopId = existing?.shopId ?? newId(12); // 24 hex chars
  const token = newId(32);                       // 64 hex chars
  const next: SheetSyncState = existing
    ? { ...existing, token, lastError: undefined, lastErrorAt: undefined }
    : {
        shopId,
        token,
        createdAt: Date.now(),
        lastSyncAt: 0,
        totalRowsEver: 0,
      };
  await kvPut(stateKey(email), next);
  // Reverse lookup is idempotent on the shopId (same value either way).
  await kvPut(reverseKey(shopId), { email: norm(email) });
  const trimmed = baseUrl.replace(/\/+$/, "");
  return {
    shopId,
    token,
    webhookUrl: `${trimmed}/api/import/webhook/${shopId}?token=${token}`,
  };
}

export async function disconnect(email: string): Promise<void> {
  const s = await getSyncState(email);
  if (!s) return;
  await kvDelete(stateKey(email));
  await kvDelete(reverseKey(s.shopId));
}

interface ReverseRecord {
  email: string;
}

/** Resolve shopId → email, then verify the provided token in constant
 *  time. Returns the email on success; null on any failure (unknown
 *  shopId, wrong token, etc.). */
export async function authenticateWebhook(shopId: string, token: string): Promise<string | null> {
  if (!shopId || !token) return null;
  const reverse = await kvGet<ReverseRecord>(reverseKey(shopId));
  const email = reverse?.email?.trim()?.toLowerCase();
  if (!email) return null;
  const state = await getSyncState(email);
  if (!state) return null;
  // Constant-time compare to neutralise timing-side-channels.
  const a = Buffer.from(state.token, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return email;
}

export async function recordSync(email: string, rowsThisPush: number): Promise<void> {
  const s = await getSyncState(email);
  if (!s) return;
  await kvPut(stateKey(email), {
    ...s,
    lastSyncAt: Date.now(),
    totalRowsEver: s.totalRowsEver + Math.max(0, rowsThisPush),
    lastError: undefined,
    lastErrorAt: undefined,
  } satisfies SheetSyncState);
}

export async function recordError(email: string, message: string): Promise<void> {
  const s = await getSyncState(email);
  if (!s) return;
  await kvPut(stateKey(email), {
    ...s,
    lastError: message.slice(0, 500),
    lastErrorAt: Date.now(),
  } satisfies SheetSyncState);
}
