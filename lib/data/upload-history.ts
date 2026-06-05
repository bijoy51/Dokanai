/**
 * Per-account history of data uploads.
 *
 * Every successful import (CSV / PDF / photos / live-sync) appends an
 * UploadEvent so the shopkeeper can see exactly what landed and when. The
 * /dashboard/uploads page reads this list; the history is also visible to
 * the Pilot agent and the data layer for audit/debug.
 *
 * Storage mirrors lib/data/imported.ts:
 *   - in-memory Map per Vercel instance (zero-cost reads after hydrate)
 *   - durable KV (`import-events:<email>`) for cross-instance survival
 *   - hydrateUploadHistory() pulls KV -> memory at the top of a request
 *
 * The list is capped at MAX_EVENTS to keep the KV payload bounded; older
 * events fall off the tail.
 */
import { kvConfigured, kvGet, kvPut, kvDelete } from "@/lib/kv";
import type { ImportDelta } from "./imported";

export type UploadSource = "csv" | "pdf" | "photos" | "live-sync";

export interface UploadEvent {
  id: string;
  source: UploadSource;
  timestamp: number;
  status: "ok" | "partial" | "failed";
  delta?: ImportDelta;
  /** Totals across the WHOLE dataset right after this upload landed. */
  totals?: { products: number; customers: number; orders: number };
  /** Free-form note — e.g. file name, error message, sync trigger source. */
  note?: string;
}

const MAX_EVENTS = 200;

const store = new Map<string, UploadEvent[]>();
const norm = (email: string) => email.trim().toLowerCase();
const kvKey = (email: string) => `import-events:${norm(email)}`;

function isEventArray(v: unknown): v is UploadEvent[] {
  return Array.isArray(v) && v.every((e) => e && typeof e === "object" && typeof (e as UploadEvent).id === "string");
}

export function getUploadHistory(email: string): UploadEvent[] {
  return store.get(norm(email)) ?? [];
}

function makeId(): string {
  // Cheap monotonic-ish id: 8 hex chars + timestamp. Doesn't need to be
  // cryptographically random — only unique within an account's history.
  const r = Math.random().toString(16).slice(2, 10);
  return `u_${Date.now().toString(36)}_${r}`;
}

/** Append a new event in memory + persist asynchronously to KV. Returns
 *  the persisted event (with assigned id + timestamp). */
export async function recordUpload(
  email: string,
  partial: Omit<UploadEvent, "id" | "timestamp"> & { id?: string; timestamp?: number },
): Promise<UploadEvent> {
  const e = norm(email);
  const event: UploadEvent = {
    id: partial.id ?? makeId(),
    timestamp: partial.timestamp ?? Date.now(),
    source: partial.source,
    status: partial.status,
    delta: partial.delta,
    totals: partial.totals,
    note: partial.note,
  };
  const existing = store.get(e) ?? [];
  // Newest first, capped at MAX_EVENTS.
  const next = [event, ...existing].slice(0, MAX_EVENTS);
  store.set(e, next);
  // Fire-and-forget persistence; never block the API response on the KV.
  void kvPut(kvKey(email), next);
  return event;
}

const inFlight = new Map<string, Promise<void>>();

/** Warm the per-instance cache from KV. Concurrent first-page requests
 *  on a cold instance share a single KV fetch. */
export async function hydrateUploadHistory(email: string): Promise<void> {
  if (!kvConfigured()) return;
  const e = norm(email);
  if (store.has(e)) return;
  const existing = inFlight.get(e);
  if (existing) {
    await existing;
    return;
  }
  const promise = (async () => {
    try {
      const v = await kvGet<unknown>(kvKey(e));
      if (isEventArray(v)) store.set(e, v);
      else store.set(e, []); // empty marker — avoids re-querying on every render
    } finally {
      inFlight.delete(e);
    }
  })();
  inFlight.set(e, promise);
  await promise;
}

export async function clearUploadHistory(email: string): Promise<void> {
  store.delete(norm(email));
  await kvDelete(kvKey(email));
}
