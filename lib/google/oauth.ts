/**
 * Google OAuth 2.0 — Web application flow.
 *
 * Pieces:
 *   - `buildAuthorizationUrl()` — returns the URL we send the user to (Google's
 *     consent screen) with a CSRF state we'll verify on return.
 *   - `exchangeCode()` — swaps an auth code for { access_token, refresh_token }.
 *   - `refreshAccessToken()` — uses the stored refresh token to mint a new
 *     access token when the cached one is near expiry.
 *   - `getAccessTokenFor(email)` — high-level: returns a valid access token
 *     for the signed-in shopkeeper, refreshing automatically if needed.
 *   - per-user token storage in Postgres (lib/kv.ts), refresh token encrypted
 *     at rest with AES-256-GCM keyed by GOOGLE_TOKEN_ENCRYPTION_KEY so a DB
 *     dump alone can't grant Google access to the dumped accounts.
 *
 * We never store the access token (it expires in ~1h anyway — cheaper to
 * always refresh from the refresh_token on demand and cache the access
 * token in-process if we want to). The refresh token only changes if the
 * user revokes access in their Google account settings; we surface that as
 * a "Reconnect" prompt in the UI.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { kvDelete, kvGet, kvPut } from "@/lib/kv";

export const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const norm = (email: string) => email.trim().toLowerCase();
const tokenKey = (email: string) => `google-oauth:${norm(email)}`;

interface StoredTokenRecord {
  /** AES-GCM-encrypted refresh_token. Decrypt with decryptRefreshToken(). */
  refreshEnc: string;
  /** Email reported by Google's userinfo endpoint — for display only. */
  googleEmail?: string;
  /** ms epoch — when the connection was first established. */
  connectedAt: number;
  /** ms epoch — when we last successfully refreshed an access token. */
  lastRefreshAt?: number;
  /** Most recent token-refresh error (e.g. invalid_grant means the user
   *  revoked access; UI shows "Reconnect"). */
  lastError?: string;
}

export interface StoredTokenPublic {
  googleEmail?: string;
  connectedAt: number;
  lastRefreshAt?: number;
  lastError?: string;
}

// ---------- env ----------

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}
function envOptional(name: string): string | null {
  const v = process.env[name];
  return v ? v.trim() : null;
}

export function isOAuthConfigured(): boolean {
  return Boolean(
    envOptional("GOOGLE_OAUTH_CLIENT_ID") &&
      envOptional("GOOGLE_OAUTH_CLIENT_SECRET") &&
      envOptional("GOOGLE_OAUTH_REDIRECT_URI") &&
      envOptional("GOOGLE_TOKEN_ENCRYPTION_KEY"),
  );
}

// ---------- encryption ----------

function getKey(): Buffer {
  const hex = env("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (hex.length !== 64) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 chars).");
  }
  return Buffer.from(hex, "hex");
}

function encryptRefreshToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv | tag | ciphertext (all hex, dot-separated to survive JSON round-trips).
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`;
}

function decryptRefreshToken(blob: string): string {
  const [ivHex, tagHex, encHex] = blob.split(".");
  if (!ivHex || !tagHex || !encHex) {
    throw new Error("Malformed encrypted refresh token");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// ---------- authorization URL ----------

/**
 * Random per-request state token. The caller stores it in a short-lived
 * HttpOnly cookie and verifies it matches on the callback. Without this an
 * attacker could trick a logged-in user into completing the OAuth dance
 * against an attacker-controlled Google account.
 */
export function newOAuthStateToken(): string {
  return randomBytes(24).toString("hex");
}

export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: env("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    // Required to receive a refresh_token on the first authorization.
    access_type: "offline",
    // Force the consent screen so we always get a refresh_token, even on
    // re-authorization. Without `prompt=consent` Google omits the refresh
    // token on subsequent grants and we can't keep syncing in the background.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------- token exchange + refresh ----------

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Swap an authorization code for tokens. Called once on the callback
 * leg of the OAuth dance.
 */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirect_uri: env("GOOGLE_OAUTH_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Resolve the user's Google profile email from an access token. Used once
 * at connect time so we can show "Connected as user@gmail.com" in the UI.
 */
export async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`refresh_failed:${res.status}:${text.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

// ---------- per-user storage ----------

/** Look up the public-safe slice of a user's Google connection. Never
 *  includes the refresh token. */
export async function getConnectionPublic(email: string): Promise<StoredTokenPublic | null> {
  const rec = await kvGet<StoredTokenRecord>(tokenKey(email));
  if (!rec) return null;
  return {
    googleEmail: rec.googleEmail,
    connectedAt: rec.connectedAt,
    lastRefreshAt: rec.lastRefreshAt,
    lastError: rec.lastError,
  };
}

export async function saveConnection(
  email: string,
  refreshToken: string,
  googleEmail?: string,
): Promise<void> {
  const rec: StoredTokenRecord = {
    refreshEnc: encryptRefreshToken(refreshToken),
    googleEmail,
    connectedAt: Date.now(),
  };
  await kvPut(tokenKey(email), rec);
}

export async function clearConnection(email: string): Promise<void> {
  const rec = await kvGet<StoredTokenRecord>(tokenKey(email));
  if (!rec) return;
  // Best-effort revoke at Google's end too, so the user's "connected apps"
  // list stays clean. Don't fail the disconnect if Google rejects this.
  try {
    const refresh = decryptRefreshToken(rec.refreshEnc);
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(refresh)}`, {
      method: "POST",
    });
  } catch {
    /* revoke is best-effort */
  }
  await kvDelete(tokenKey(email));
}

/**
 * Return a fresh, valid access token for the user's stored Google
 * connection. Throws if not connected or if Google rejects the refresh
 * (invalid_grant means the user revoked us — caller should surface a
 * "Reconnect" prompt).
 */
export async function getAccessTokenFor(email: string): Promise<string> {
  const rec = await kvGet<StoredTokenRecord>(tokenKey(email));
  if (!rec) throw new Error("not_connected");
  const refreshToken = decryptRefreshToken(rec.refreshEnc);
  try {
    const tok = await refreshAccessToken(refreshToken);
    // Update lastRefreshAt + clear error, but keep the original refresh
    // token (Google does not rotate refresh tokens by default for web
    // app clients).
    await kvPut(tokenKey(email), {
      ...rec,
      lastRefreshAt: Date.now(),
      lastError: undefined,
    } satisfies StoredTokenRecord);
    return tok.access_token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "refresh_failed";
    await kvPut(tokenKey(email), {
      ...rec,
      lastError: msg.slice(0, 300),
    } satisfies StoredTokenRecord);
    // Rethrow with the original message so the API layer can map
    // invalid_grant → reconnect UX.
    throw err;
  }
}

/**
 * List every user that has a stored Google connection. Used by the Cron
 * job that walks all connections and re-fetches their sheets. We keep
 * this lazy on the kv layer (the kv currently has no LIST primitive) by
 * maintaining a separate index set.
 */
const INDEX_KEY = "google-oauth:_index";

export async function indexAdd(email: string): Promise<void> {
  const idx = (await kvGet<{ emails: string[] }>(INDEX_KEY)) ?? { emails: [] };
  const set = new Set(idx.emails.map((e) => e.trim().toLowerCase()));
  set.add(norm(email));
  await kvPut(INDEX_KEY, { emails: [...set] });
}

export async function indexRemove(email: string): Promise<void> {
  const idx = await kvGet<{ emails: string[] }>(INDEX_KEY);
  if (!idx) return;
  const next = idx.emails.filter((e) => e.trim().toLowerCase() !== norm(email));
  await kvPut(INDEX_KEY, { emails: next });
}

export async function listConnectedEmails(): Promise<string[]> {
  const idx = await kvGet<{ emails: string[] }>(INDEX_KEY);
  return idx?.emails ?? [];
}
