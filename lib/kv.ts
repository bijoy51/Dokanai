/**
 * Generic key-value store used across the app for accounts, datasets, chats,
 * campaigns, shop profiles, upload history, sheet-sync tokens, and saved
 * analyses.
 *
 * Storage strategy (durable, lazy-migrated):
 *
 *   1. PRIMARY — Neon Postgres via the Vercel Marketplace integration. A
 *      single `kv` table with (key TEXT PK, value JSONB, updated_at) holds
 *      everything. Schema is bootstrapped on first call via
 *      CREATE TABLE IF NOT EXISTS — no manual migrations.
 *
 *   2. LAZY FALLBACK — the legacy HF Space dict KV at `/kv/{key}`. When the
 *      Postgres read misses but the HF KV still has the value, this module
 *      copies it across to Postgres on the fly and returns it. That's how
 *      previously-registered shopkeepers' accounts and imported datasets
 *      get transparently migrated as they come back to the site — no admin
 *      script, no downtime, no data loss.
 *
 *   3. LOCAL DEV — if neither POSTGRES_URL nor ML_BACKEND_URL is configured
 *      every call is a no-op returning null/false, so the in-memory Map
 *      caches in each lib/data/* module become the only storage. Same
 *      behaviour the project has always had in dev.
 *
 * Callers (lib/users.ts, lib/data/imported.ts, lib/agent/store.ts, etc.)
 * only ever see `kvGet / kvPut / kvDelete`. They didn't change.
 */
import { Pool } from "pg";

const POSTGRES_URL = process.env.POSTGRES_URL?.trim();
const HF_TIMEOUT_MS = 12_000;

// ---------- Postgres singleton ----------

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!POSTGRES_URL) return null;
  if (pool) return pool;
  // Cap connections aggressively — Neon free tier has tight limits and
  // every Vercel serverless instance opens its own pool. We rarely run more
  // than one query at a time per instance.
  pool = new Pool({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

// One-shot, deduped, retryable schema bootstrap.
let schemaPromise: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  const p = getPool();
  if (!p) return;
  schemaPromise = (async () => {
    try {
      await p.query(
        `CREATE TABLE IF NOT EXISTS kv (
           key TEXT PRIMARY KEY,
           value JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
    } catch (e) {
      schemaPromise = null; // allow retry on next call
      throw e;
    }
  })();
  return schemaPromise;
}

// ---------- HF KV (legacy fallback only) ----------

function hfKvConfig(): { base: string; secret: string } | null {
  const url = process.env.ML_BACKEND_URL?.trim();
  const secret = (process.env.ML_ADMIN_SECRET || process.env.ADMIN_SECRET || "").trim();
  if (!url || !secret) return null;
  return { base: url.replace(/\s+/g, "").replace(/\/+$/, ""), secret };
}

async function hfKvGet<T>(key: string): Promise<T | null> {
  const cfg = hfKvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      headers: { "x-admin-secret": cfg.secret },
      signal: AbortSignal.timeout(HF_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function hfKvPut(key: string, value: unknown): Promise<boolean> {
  const cfg = hfKvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": cfg.secret },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(HF_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function hfKvDelete(key: string): Promise<boolean> {
  const cfg = hfKvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { "x-admin-secret": cfg.secret },
      signal: AbortSignal.timeout(HF_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Public KV API (Postgres-first, HF-fallback) ----------

export function kvConfigured(): boolean {
  return !!POSTGRES_URL || hfKvConfig() !== null;
}

/** GET — Postgres first; on miss try HF KV and lazy-copy back. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const p = getPool();
  if (p) {
    try {
      await ensureSchema();
      const res = await p.query("SELECT value FROM kv WHERE key = $1", [key]);
      if (res.rowCount && res.rows.length > 0) {
        return res.rows[0].value as T;
      }
      // Postgres miss — try the legacy HF KV. If it has the key, copy it
      // into Postgres so subsequent reads stay fast and the HF dependency
      // disappears for that key.
      const fromHf = await hfKvGet<T>(key);
      if (fromHf !== null && fromHf !== undefined) {
        try {
          await p.query(
            `INSERT INTO kv (key, value) VALUES ($1, $2::jsonb)
             ON CONFLICT (key) DO NOTHING`,
            [key, JSON.stringify(fromHf)],
          );
        } catch (e) {
          console.error("[kv] lazy-migration write failed for", key, e);
          /* non-fatal — we still return the value */
        }
        return fromHf;
      }
      return null;
    } catch (e) {
      console.error("[kv] Postgres read failed for", key, e);
      // Defensive: keep the site working off the HF KV if Postgres is down.
      return hfKvGet<T>(key);
    }
  }
  // No Postgres → behave like before.
  return hfKvGet<T>(key);
}

/** PUT — Postgres only when available. We don't double-write to HF KV
 *  because Postgres is now the source of truth; HF is read-only fallback. */
export async function kvPut(key: string, value: unknown): Promise<boolean> {
  const p = getPool();
  if (p) {
    try {
      await ensureSchema();
      await p.query(
        `INSERT INTO kv (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
      return true;
    } catch (e) {
      console.error("[kv] Postgres write failed for", key, e);
      return hfKvPut(key, value);
    }
  }
  return hfKvPut(key, value);
}

/** DELETE — remove from Postgres AND HF KV, so a stale value can't sneak
 *  back through the lazy-migration path on the next read. */
export async function kvDelete(key: string): Promise<boolean> {
  const p = getPool();
  if (p) {
    try {
      await ensureSchema();
      await p.query("DELETE FROM kv WHERE key = $1", [key]);
      void hfKvDelete(key); // best-effort, don't block on it
      return true;
    } catch (e) {
      console.error("[kv] Postgres delete failed for", key, e);
      return hfKvDelete(key);
    }
  }
  return hfKvDelete(key);
}
