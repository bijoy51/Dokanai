import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Account store.
 *
 * Persistence is now real Postgres (Neon, via lib/kv.ts). The shared KV
 * surface is preserved — we still call kvGet / kvPut — so this module
 * didn't need to learn about a database.
 *
 * Password hashing migrated from peppered SHA-256 to **bcrypt** with full
 * backward compatibility:
 *
 *   - createAccount stores a bcrypt hash for every new account.
 *   - verifyAccount detects the hash format. If it's bcrypt (`$2…`), use
 *     bcrypt.compare. If it's the legacy peppered-SHA-256 hex digest, fall
 *     back to the old check, and on a successful match **rehash to bcrypt**
 *     and write it back. Existing demo and real accounts keep logging in
 *     without anyone needing to reset their password — they migrate the
 *     first time they sign in.
 *
 * Plaintext passwords never leave this module.
 */

const PEPPER = process.env.AUTH_SECRET || "dokanai-dev-secret-change-in-production";
const BCRYPT_COST = 10;

export interface Account {
  name: string;
  email: string;
  passwordHash: string;
}

const accounts = new Map<string, Account>();

/** Legacy peppered-SHA-256 — kept for verifying old hashes on first login. */
function legacyHash(pw: string): string {
  return crypto.createHash("sha256").update(`${pw}::${PEPPER}`).digest("hex");
}

async function newHash(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_COST);
}

function isBcryptHash(h: string): boolean {
  return h.startsWith("$2a$") || h.startsWith("$2b$") || h.startsWith("$2y$");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------- shared KV (now Postgres via lib/kv.ts) ----------

import { kvGet, kvPut } from "@/lib/kv";

function kvKey(email: string): string {
  return `account:${email}`;
}

async function kvGetAccount(email: string): Promise<Account | null> {
  const data = await kvGet<Partial<Account> | null>(kvKey(email));
  if (!data) return null;
  if (typeof data.email === "string" && typeof data.passwordHash === "string") {
    return {
      name: data.name ?? data.email.split("@")[0],
      email: data.email,
      passwordHash: data.passwordHash,
    };
  }
  return null;
}

async function kvPutAccount(acc: Account): Promise<boolean> {
  return kvPut(kvKey(acc.email), acc);
}

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

/** Strong-password gate applied to NEW signups only. Existing accounts
 *  with weaker passwords keep verifying with verifyAccount() — we never
 *  re-validate the password on login, only the hash. */
function validateStrongPassword(pw: string): string | null {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/\d/.test(pw)) return "Password must include a number.";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pw))
    return "Password must include a special character.";
  return null;
}

export async function createAccount(name: string, email: string, password: string): Promise<Account> {
  const trimmedName = (name || "").trim();
  if (!trimmedName) throw new Error("Shop name is required.");
  if (trimmedName.length > 80) throw new Error("Shop name is too long (max 80 characters).");
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) throw new Error("Please enter a valid email address.");
  const pwError = validateStrongPassword(password);
  if (pwError) throw new Error(pwError);
  if (await loadAccount(e)) {
    throw new Error("An account with this email already exists. Try logging in.");
  }
  const acc: Account = {
    name: trimmedName,
    email: e,
    passwordHash: await newHash(password),
  };
  // Persist to the shared KV (Postgres) first so the account is reachable
  // from any Vercel instance. The kv layer handles durability + lazy HF
  // fallback. If the KV write fails outright, surface an error rather
  // than creating an account that silently won't survive a cold start.
  const ok = await kvPutAccount(acc);
  if (!ok) throw new Error("Could not save your account right now. Please try again.");
  accounts.set(e, acc);
  return acc;
}

export async function verifyAccount(email: string, password: string): Promise<Account | null> {
  const e = normalizeEmail(email);
  const acc = await loadAccount(e);
  if (!acc) return null;

  // Branch on hash format so legacy SHA-256 hashes keep verifying.
  if (isBcryptHash(acc.passwordHash)) {
    const match = await bcrypt.compare(password, acc.passwordHash);
    return match ? acc : null;
  }

  // Legacy peppered SHA-256 path — verify against the old hash; if it
  // matches, rehash to bcrypt and persist. The user notices nothing; the
  // KV gets quietly upgraded.
  if (acc.passwordHash !== legacyHash(password)) return null;
  try {
    const upgraded: Account = { ...acc, passwordHash: await newHash(password) };
    accounts.set(e, upgraded);
    await kvPutAccount(upgraded);
    return upgraded;
  } catch (err) {
    // If the rehash write fails for any reason, the user is still logged
    // in successfully — they'll just get migrated next time.
    console.error("[users] bcrypt upgrade failed for", e, err);
    return acc;
  }
}

export async function accountExists(email: string): Promise<boolean> {
  return !!(await loadAccount(normalizeEmail(email)));
}
