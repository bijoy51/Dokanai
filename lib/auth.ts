import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * Lightweight stateless session: an HMAC-signed cookie.
 * No external auth provider needed. For production, swap in a real
 * provider (NextAuth / Clerk / Supabase) and a user database.
 */

const SECRET = process.env.AUTH_SECRET || "dokanai-dev-secret-change-in-production";
export const SESSION_COOKIE = "dokanai_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

/** Stable per-account key used to seed that account's dataset. */
export function userKeyFromSession(s: Session | null): string {
  return s?.email ?? "demo@dokanai.app";
}
