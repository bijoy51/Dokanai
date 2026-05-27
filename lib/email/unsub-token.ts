/**
 * HMAC-signed unsubscribe tokens.
 *
 * The token embeds (email, customerId) so a click on the unsubscribe link
 * uniquely identifies who to opt out without exposing internal IDs in raw
 * form. Signed with AUTH_SECRET (same one already used by the session cookie
 * — see lib/auth.ts) so we don't introduce a new secret.
 *
 * Format: base64url(JSON({a:<accountEmail>, c:<customerId>})).<base64url-sig>
 */
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "dokanai-dev-secret-change-in-production";

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export interface UnsubToken {
  /** Shop owner's email (account-scope key). */
  account: string;
  /** Customer id within that account. */
  customer: string;
}

export function makeUnsubToken(t: UnsubToken): string {
  const payload = Buffer.from(JSON.stringify({ a: t.account, c: t.customer })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseUnsubToken(token: string | undefined | null): UnsubToken | null {
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
    if (typeof obj?.a === "string" && typeof obj?.c === "string") {
      return { account: obj.a, customer: obj.c };
    }
  } catch {
    /* fall-through */
  }
  return null;
}
