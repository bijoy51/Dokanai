/**
 * Per-account saved shop-analysis result.
 *
 * One snapshot per account, written when the user clicks "Analyze my DokanAI
 * shop" on /dashboard/analyze. Uploaded-CSV analyses are NEVER written here
 * — those stay tab-local in sessionStorage as before. The split lets the
 * shopkeeper preview "what would this look like if I uploaded X?" without
 * destroying their persisted view.
 *
 * Storage mirrors lib/data/imported.ts:
 *   - in-memory Map per Vercel instance (zero-cost reads after hydrate)
 *   - shared KV (`analysis:<email>`) for cross-instance survival
 *   - hydrateSavedAnalysis() warms KV -> memory at the top of a request
 */
import { kvConfigured, kvGet, kvPut, kvDelete } from "@/lib/kv";
import type { AnalyzeShopResponse } from "@/lib/ai/shop-analysis";

export interface SavedShopAnalysis {
  result: AnalyzeShopResponse;
  /** Whatever the user typed in the "Shop name" form field (or omitted). */
  shopName?: string;
  /** Whatever the user typed in the "Region / city" form field. */
  region?: string;
  /** Unix ms timestamp at server-side persist time. */
  savedAt: number;
}

const store = new Map<string, SavedShopAnalysis>();
const norm = (email: string) => email.trim().toLowerCase();
const kvKey = (email: string) => `analysis:${norm(email)}`;

function isSaved(v: unknown): v is SavedShopAnalysis {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<SavedShopAnalysis>;
  return !!d.result && typeof d.savedAt === "number";
}

export function getSavedAnalysis(email: string): SavedShopAnalysis | undefined {
  return store.get(norm(email));
}

export function setSavedAnalysis(email: string, s: SavedShopAnalysis): void {
  store.set(norm(email), s);
}

export function clearSavedAnalysis(email: string): void {
  store.delete(norm(email));
}

export async function persistSavedAnalysis(email: string, s: SavedShopAnalysis): Promise<boolean> {
  return kvPut(kvKey(email), s);
}

const inFlight = new Map<string, Promise<void>>();

/** Warm the per-instance cache from KV. Concurrent first-page requests
 *  on a cold instance share a single KV fetch. */
export async function hydrateSavedAnalysis(email: string): Promise<void> {
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
      if (isSaved(v)) store.set(e, v);
    } finally {
      inFlight.delete(e);
    }
  })();
  inFlight.set(e, promise);
  await promise;
}

export async function removeSavedAnalysis(email: string): Promise<void> {
  clearSavedAnalysis(email);
  await kvDelete(kvKey(email));
}
