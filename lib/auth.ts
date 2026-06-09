import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * Lightweight stateless session: an HMAC-signed cookie.
 * No external auth provider needed. For production, swap in a real
 * provider (NextAuth / Clerk / Supabase) and a user database.
 */

/**
 * Resolve the HMAC secret.
 *
 *   - In development we tolerate a missing env var and fall back to a
 *     well-known placeholder so `npm run dev` Just Works on a fresh
 *     checkout. The placeholder is harmless locally — no one is reading
 *     dev cookies.
 *
 *   - In production we refuse to start up if AUTH_SECRET is missing.
 *     The previous behaviour (silently fall back to the placeholder)
 *     meant every session token on a misconfigured deploy was signed
 *     with a literal string anyone with the repo could see — a forgery
 *     vector that lets any visitor mint a session for any email.
 *     Failing closed is the only safe default.
 */
function resolveSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Set it to a strong random value (e.g. `openssl rand -hex 32`) on Vercel and redeploy.",
    );
  }
  return "dokanai-dev-secret-change-in-production";
}

const SECRET = resolveSecret();
export const SESSION_COOKIE = "dokanai_session";
// 1-year persistent session. Bumped from 30 days so users who install
// the PWA on their phone effectively never re-authenticate until they
// explicitly tap "Log out" — matches the "sign in once" install UX.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export interface Session {
  email: string;
  name: string;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

export function signSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): Session | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (obj && typeof obj.email === "string" && typeof obj.name === "string") {
      return { email: obj.email, name: obj.name };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Reads the session from the request cookie. Server-side only.
 * Calling cookies() opts the caller into dynamic rendering, which is
 * what we want for auth-aware pages.
 */
export function getSession(): Session | null {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}
