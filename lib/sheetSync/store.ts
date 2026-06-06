/**
 * Per-shop sheet-binding state for the pull-based Live Sync.
 *
 * In the new model the user signs in with Google (state lives in
 * lib/google/oauth.ts), then binds ONE Google Sheet to their shop by
 * pasting its ID. This file owns that binding plus the sync counters.
 *
 * Two Postgres keys per shop:
 *   - `sheet-binding:<email>`       — the binding row (sheetId, status,
 *                                      counters, last error). Source of truth.
 *   - `sheet-binding:_index`        — set of all bound emails so the Cron
 *                                      can iterate without scanning the kv.
 *
 * The previous incarnation of this file stored long-lived webhook tokens
 * and reverse-lookup rows for an Apps Script push model. Both are gone —
 * the new model is pull-only, authenticated by the user's OAuth refresh
 * token in lib/google/oauth.ts.
 */

import { kvDelete, kvGet, kvPut } from "@/lib/kv";

const norm = (email: string) => email.trim().toLowerCase();
const bindingKey = (email: string) => `sheet-binding:${norm(email)}`;
const INDEX_KEY = "sheet-binding:_index";

export interface SheetBinding {
  /** Google spreadsheet ID extracted from the URL or pasted directly. */
  sheetId: string;
  /** Title returned by the Sheets API at connect time — for display. */
  sheetTitle?: string;
  /** ms epoch — when this binding was created. */
  createdAt: number;
  /** ms epoch — last successful sync. 0 = never. */
  lastSyncAt: number;
  /** Running total of rows ever pulled from this sheet. */
  totalRowsEver: number;
  /** Most recent error from a failed sync attempt, for the UI. */
  lastError?: string;
  /** ms epoch — when the most recent error happened. */
  lastErrorAt?: number;
}

export interface SheetBindingPublic extends SheetBinding {}

export async function getBinding(email: string): Promise<SheetBinding | null> {
  return (await kvGet<SheetBinding>(bindingKey(email))) ?? null;
}

export async function setBinding(
  email: string,
  sheetId: string,
  sheetTitle?: string,
): Promise<SheetBinding> {
  const existing = await getBinding(email);
  const next: SheetBinding = existing
    ? { ...existing, sheetId, sheetTitle, lastError: undefined, lastErrorAt: undefined }
    : {
        sheetId,
        sheetTitle,
        createdAt: Date.now(),
        lastSyncAt: 0,
        totalRowsEver: 0,
      };
  await kvPut(bindingKey(email), next);
  await indexAdd(email);
  return next;
}

export async function clearBinding(email: string): Promise<void> {
  await kvDelete(bindingKey(email));
  await indexRemove(email);
}

export async function recordSync(email: string, rowsThisPull: number): Promise<void> {
  const b = await getBinding(email);
  if (!b) return;
  await kvPut(bindingKey(email), {
    ...b,
    lastSyncAt: Date.now(),
    totalRowsEver: b.totalRowsEver + Math.max(0, rowsThisPull),
    lastError: undefined,
    lastErrorAt: undefined,
  } satisfies SheetBinding);
}

export async function recordError(email: string, message: string): Promise<void> {
  const b = await getBinding(email);
  if (!b) return;
  await kvPut(bindingKey(email), {
    ...b,
    lastError: message.slice(0, 500),
    lastErrorAt: Date.now(),
  } satisfies SheetBinding);
}

// ---------- email index (for the Cron sweep) ----------

async function indexAdd(email: string): Promise<void> {
  const idx = (await kvGet<{ emails: string[] }>(INDEX_KEY)) ?? { emails: [] };
  const set = new Set(idx.emails.map((e) => e.trim().toLowerCase()));
  set.add(norm(email));
  await kvPut(INDEX_KEY, { emails: [...set] });
}

async function indexRemove(email: string): Promise<void> {
  const idx = await kvGet<{ emails: string[] }>(INDEX_KEY);
  if (!idx) return;
  const next = idx.emails.filter((e) => e.trim().toLowerCase() !== norm(email));
  await kvPut(INDEX_KEY, { emails: next });
}

export async function listBoundEmails(): Promise<string[]> {
  const idx = await kvGet<{ emails: string[] }>(INDEX_KEY);
  return idx?.emails ?? [];
}
