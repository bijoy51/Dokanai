/**
 * Developer API key storage.
 *
 * Discipline:
 *   - Keys are `sk_live_<48 url-safe random chars>` (3-letter prefix +
 *     underscore + payload). The prefix makes them easy to spot in logs
 *     and lets a SAST scanner regex-match them in git pushes.
 *   - The full key value is returned to the user EXACTLY ONCE at create
 *     time. We store only its SHA-256 hash + a 4-char tail (for UI
 *     identification like `sk_live_…wxyz`) — a Postgres dump cannot
 *     reconstruct the original token.
 *   - The token IS the credential. No session needed at request time.
 *
 * Two Postgres keys per shop:
 *   - `api-key:<keyId>`         — { hashHex, email, scope, label,
 *                                   createdAt, lastUsedAt, revokedAt }.
 *                                 keyId is a random 12-char public handle,
 *                                 NOT derived from the secret.
 *   - `api-key-index:<email>`   — { keyIds: string[] } — so the dashboard
 *                                 can list a shop's keys without a kv scan.
 */

import { createHash, randomBytes } from "crypto";
import { kvDelete, kvGet, kvPut } from "@/lib/kv";

const norm = (email: string) => email.trim().toLowerCase();
const keyRecordKey = (keyId: string) => `api-key:${keyId}`;
const indexKey = (email: string) => `api-key-index:${norm(email)}`;

export type ApiKeyScope = "read" | "write" | "read+write";

export interface ApiKeyRecord {
  /** Public, random handle used in URLs / kv lookup. Not derived from secret. */
  keyId: string;
  /** SHA-256(secret) as hex. The only copy of the secret we keep. */
  hashHex: string;
  /** Last 4 chars of the secret, shown in UI as `sk_live_…<tail>`. */
  tail: string;
  email: string;
  scope: ApiKeyScope;
  /** Human label set at create time ("prod backend", "Aisha's laptop"). */
  label: string;
  createdAt: number;
  /** ms epoch — null until first use. */
  lastUsedAt?: number;
  /** Soft-delete: revoked keys live on for audit but auth rejects them. */
  revokedAt?: number;
}

/** Slice surfaced to the dashboard — never includes the hash. */
export interface ApiKeyPublic {
  keyId: string;
  tail: string;
  scope: ApiKeyScope;
  label: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

/** Returned ONCE, at create time. */
export interface ApiKeyCreated {
  keyId: string;
  /** Full `sk_live_…` secret — show, copy, never persist plaintext. */
  secret: string;
  public: ApiKeyPublic;
}

function publicShape(r: ApiKeyRecord): ApiKeyPublic {
  return {
    keyId: r.keyId,
    tail: r.tail,
    scope: r.scope,
    label: r.label,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  };
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** url-safe base64 (no padding) — avoids `+`, `/`, `=` in headers. */
function urlSafeRandom(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

// ---------- create ----------

export async function createKey(
  email: string,
  scope: ApiKeyScope,
  label: string,
): Promise<ApiKeyCreated> {
  const keyId = randomBytes(6).toString("hex"); // 12 hex chars — public id
  const payload = urlSafeRandom(36); // ~48 url-safe chars
  const secret = `sk_live_${payload}`;
  const tail = secret.slice(-4);
  const record: ApiKeyRecord = {
    keyId,
    hashHex: hashSecret(secret),
    tail,
    email: norm(email),
    scope,
    label: label.slice(0, 60),
    createdAt: Date.now(),
  };
  await kvPut(keyRecordKey(keyId), record);
  await addToIndex(email, keyId);
  await indexHash(record);
  return { keyId, secret, public: publicShape(record) };
}

async function addToIndex(email: string, keyId: string): Promise<void> {
  const idx = (await kvGet<{ keyIds: string[] }>(indexKey(email))) ?? { keyIds: [] };
  if (!idx.keyIds.includes(keyId)) idx.keyIds.push(keyId);
  await kvPut(indexKey(email), idx);
}

async function removeFromIndex(email: string, keyId: string): Promise<void> {
  const idx = await kvGet<{ keyIds: string[] }>(indexKey(email));
  if (!idx) return;
  await kvPut(indexKey(email), { keyIds: idx.keyIds.filter((k) => k !== keyId) });
}

// ---------- read ----------

export async function listKeysFor(email: string): Promise<ApiKeyPublic[]> {
  const idx = await kvGet<{ keyIds: string[] }>(indexKey(email));
  if (!idx) return [];
  const out: ApiKeyPublic[] = [];
  for (const keyId of idx.keyIds) {
    const rec = await kvGet<ApiKeyRecord>(keyRecordKey(keyId));
    if (rec) out.push(publicShape(rec));
  }
  // Most recently created first.
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export async function getKeyRecord(keyId: string): Promise<ApiKeyRecord | null> {
  return (await kvGet<ApiKeyRecord>(keyRecordKey(keyId))) ?? null;
}

// ---------- auth lookup ----------

/**
 * Find the record matching a raw `sk_live_…` secret. We don't know the
 * keyId from the secret alone, so we scan the requester's index — but we
 * don't have the requester's email at this point. Instead we maintain a
 * SECONDARY index keyed by hash so auth is O(1):
 *   `api-key-by-hash:<hashHex>` -> { keyId }
 */
const byHashKey = (hashHex: string) => `api-key-by-hash:${hashHex}`;

export async function resolveSecret(secret: string): Promise<ApiKeyRecord | null> {
  if (!secret || !secret.startsWith("sk_live_")) return null;
  const hashHex = hashSecret(secret);
  const ref = await kvGet<{ keyId: string }>(byHashKey(hashHex));
  if (!ref) return null;
  const rec = await getKeyRecord(ref.keyId);
  if (!rec) return null;
  if (rec.revokedAt) return null;
  // Defensive: verify the stored hash actually matches (it must, since we
  // looked up by hash, but this catches a hypothetical hash collision or
  // tampered record).
  if (rec.hashHex !== hashHex) return null;
  return rec;
}

// ---------- revoke ----------

export async function revokeKey(email: string, keyId: string): Promise<boolean> {
  const rec = await getKeyRecord(keyId);
  if (!rec) return false;
  if (rec.email !== norm(email)) return false; // can't revoke other shops' keys
  if (rec.revokedAt) return true;
  rec.revokedAt = Date.now();
  await kvPut(keyRecordKey(keyId), rec);
  // Drop the hash index so auth becomes O(1)-not-found instead of needing
  // to fetch the record and check revokedAt.
  await kvDelete(byHashKey(rec.hashHex));
  await removeFromIndex(email, keyId);
  return true;
}

// ---------- bookkeeping ----------

/**
 * Called from the auth middleware on every successful API call. Updates
 * lastUsedAt without touching anything else.
 */
export async function stampLastUsed(keyId: string): Promise<void> {
  const rec = await getKeyRecord(keyId);
  if (!rec) return;
  rec.lastUsedAt = Date.now();
  await kvPut(keyRecordKey(keyId), rec);
}

/**
 * Companion to createKey() — writes the hash → keyId reverse index. Kept
 * separate so createKey can complete the record first and we don't end up
 * with a dangling secondary index pointing at a half-written record.
 */
export async function indexHash(record: ApiKeyRecord): Promise<void> {
  await kvPut(byHashKey(record.hashHex), { keyId: record.keyId });
}
