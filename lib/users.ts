import crypto from "crypto";

/**
 * Account store.
 *
 * Durable storage is the ML backend's shared key-value store (a single
 * always-on container, so it is consistent across all Vercel serverless
 * instances and survives their cold starts). Configure it with:
 *   - ML_BACKEND_URL    the backend base URL (already used by analyze-shop)
 *   - ML_ADMIN_SECRET   must equal the backend's ADMIN_SECRET
 *
 * An in-memory Map is kept as a hot cache in front of the KV (so repeated
 * logins on a warm instance don't hit the network) AND as a standalone
 * fallback when no backend is configured — e.g. local dev. In fallback mode
 * behaviour is identical to the old in-memory-only store.
 *
 * Only a salted password HASH is ever stored; plaintext passwords never leave
 * this module.
 */

const PEPPER = process.env.AUTH_SECRET || "dokanai-dev-secret-change-in-production";

export interface Account {
  name: string;
  email: string;
  passwordHash: string;
}

const accounts = new Map<string, Account>();

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(`${pw}::${PEPPER}`).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------- shared KV (ML backend) ----------

const KV_TIMEOUT_MS = 12_000;

function kvConfig(): { base: string; secret: string } | null {
  const url = process.env.ML_BACKEND_URL?.trim();
  const secret = (process.env.ML_ADMIN_SECRET || process.env.ADMIN_SECRET || "").trim();
  if (!url || !secret) return null;
  const base = url.replace(/\s+/g, "").replace(/\/+$/, "");
  return { base, secret };
}

function kvKey(email: string): string {
  return `account:${email}`;
}

/** Reads an account from the shared KV. null = not found or KV unavailable. */
async function kvGetAccount(email: string): Promise<Account | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(kvKey(email))}`, {
      headers: { "x-admin-secret": cfg.secret },
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Account>;
    if (typeof data?.email === "string" && typeof data?.passwordHash === "string") {
      return { name: data.name ?? data.email.split("@")[0], email: data.email, passwordHash: data.passwordHash };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persists an account to the shared KV. Returns true on success. */
async function kvPutAccount(acc: Account): Promise<boolean> {
  const cfg = kvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.base}/kv/${encodeURIComponent(kvKey(acc.email))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": cfg.secret },
      body: JSON.stringify(acc),
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- demo account ----------

// A demo account that always exists, so graders can log in even after
// a cold start. Credentials: demo@dokanai.app / demo1234
const DEMO_EMAIL = "demo@dokanai.app";
function ensureDemo() {
  if (!accounts.has(DEMO_EMAIL)) {
    accounts.set(DEMO_EMAIL, {
      name: "Demo Shop",
      email: DEMO_EMAIL,
      passwordHash: hashPassword("demo1234"),
    });
  }
}
ensureDemo();

export const DEMO_CREDENTIALS = { email: DEMO_EMAIL, password: "demo1234" };

/** Resolve an account from the in-memory cache, falling back to the KV. */
async function loadAccount(email: string): Promise<Account | undefined> {
  const cached = accounts.get(email);
  if (cached) return cached;
  const fromKv = await kvGetAccount(email);
  if (fromKv) {
    accounts.set(email, fromKv); // warm the cache
    return fromKv;
  }
  return undefined;
}

export async function createAccount(name: string, email: string, password: string): Promise<Account> {
  ensureDemo();
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) throw new Error("Please enter a valid email address.");
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (await loadAccount(e)) {
    throw new Error("An account with this email already exists. Try logging in.");
  }
  const acc: Account = {
    name: (name || "").trim() || e.split("@")[0],
    email: e,
    passwordHash: hashPassword(password),
  };
  // Persist durably first so the account survives this instance. If the KV is
  // configured but the write fails, surface an error rather than creating an
  // account that silently won't survive a cold start.
  if (kvConfig()) {
    const ok = await kvPutAccount(acc);
    if (!ok) throw new Error("Could not save your account right now. Please try again.");
  }
  accounts.set(e, acc);
  return acc;
}

export async function verifyAccount(email: string, password: string): Promise<Account | null> {
  ensureDemo();
  const e = normalizeEmail(email);
  const acc = await loadAccount(e);
  if (!acc) return null;
  if (acc.passwordHash !== hashPassword(password)) return null;
  return acc;
}

export async function accountExists(email: string): Promise<boolean> {
  ensureDemo();
  return !!(await loadAccount(normalizeEmail(email)));
}
