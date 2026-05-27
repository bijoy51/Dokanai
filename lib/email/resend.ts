/**
 * Thin client for Resend's transactional email API.
 *
 * Env-gated: when RESEND_API_KEY or FROM_EMAIL is missing, sendEmail() does
 * NOT throw — it resolves with `{ ok: false, reason: "not-configured" }` so
 * the cron worker can still process due campaigns and mark recipients as
 * failed-not-configured rather than blowing up the whole run. This means the
 * email automation deploys safely without secrets and "lights up" the moment
 * those env vars are set on Vercel.
 *
 * Required env vars to actually send:
 *   RESEND_API_KEY   re_...
 *   FROM_EMAIL       e.g. "Pilot <pilot@mail.yourdomain.com>" (display name + address)
 * Optional:
 *   REPLY_TO         a reachable inbox for customer replies
 */

const RESEND_URL = "https://api.resend.com/emails";

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional per-message tag — used for idempotency tracking, surfaced in
   *  Resend's dashboard. Keep <= 256 chars, no spaces. */
  idempotencyKey?: string;
  /** Optional one-click unsubscribe URL. Sets List-Unsubscribe headers
   *  (mandatory for Gmail/Yahoo bulk-sender compliance, Feb 2024+). */
  unsubscribeUrl?: string;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-configured" | "send-failed" | "rate-limited" | "invalid-recipient"; message?: string };

function cfg(): { apiKey: string; from: string; replyTo?: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.REPLY_TO?.trim() || undefined };
}

export function emailConfigured(): boolean {
  return cfg() !== null;
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const c = cfg();
  if (!c) return { ok: false, reason: "not-configured" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    return { ok: false, reason: "invalid-recipient" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${c.apiKey}`,
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);

  // Gmail/Yahoo bulk-sender compliance: include both the URL form and the
  // one-click POST form so the "Unsubscribe" link renders natively in the
  // recipient's inbox.
  const listUnsubHeaders: Record<string, string> = input.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};

  const body: Record<string, unknown> = {
    from: c.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: listUnsubHeaders,
  };
  if (c.replyTo) body.reply_to = c.replyTo;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) return { ok: false, reason: "rate-limited" };
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      return { ok: false, reason: "send-failed", message: data.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, reason: "send-failed", message: e instanceof Error ? e.message : "unknown" };
  }
}
