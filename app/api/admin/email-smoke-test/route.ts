/**
 * POST /api/admin/email-smoke-test
 *
 *   headers: Authorization: Bearer ${CRON_SECRET}
 *   body:    { to, subject?, body? }
 *   -> { ok, providerId?, to, reason?, message? }
 *
 * Internal-only end-to-end check that the Resend integration is configured
 * and reachable from the production runtime. Renders one email through the
 * same template renderer the real flows use, so a green response proves the
 * whole pipeline (env vars + HTTPS to Resend + DNS/SPF on FROM_EMAIL).
 *
 * Not exposed in any UI. The CRON_SECRET gate is the same gate the cron
 * worker already uses, so we are not widening the trust surface.
 */
import { NextResponse } from "next/server";
import { renderCampaignEmail } from "@/lib/email/template";
import { sendEmail, emailConfigured } from "@/lib/email/resend";
import { bearerOk } from "@/lib/security/bearerAuth";
import { consumeQuota, rateLimitHeaders } from "@/lib/security/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Even with CRON_SECRET, cap calls per source IP so a leaked secret
// cannot be weaponised into an unlimited mail relay before we rotate.
const SMOKE_LIMIT_PER_HOUR = 30;
const SMOKE_WINDOW_SEC = 60 * 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!bearerOk(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ip = clientIp(req);
  const quota = await consumeQuota("smoke-test", ip, SMOKE_LIMIT_PER_HOUR, SMOKE_WINDOW_SEC);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "Smoke-test rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(quota, SMOKE_LIMIT_PER_HOUR) },
    );
  }

  let body: { to?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = (body.to ?? "").trim().toLowerCase();
  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Valid `to` email required." }, { status: 400 });
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      { ok: false, to, reason: "not-configured", message: "RESEND_API_KEY / FROM_EMAIL not set." },
      { status: 503 },
    );
  }

  const subject = (body.subject ?? "").trim() || "DokanAI email smoke test";
  const text =
    (body.body ?? "").trim() ||
    "If you can read this, DokanAI's Resend integration is wired correctly end-to-end (env vars, DNS, template renderer).";

  const url = new URL(req.url);
  const origin = process.env.APP_ORIGIN?.trim() || `${url.protocol}//${url.host}`;

  const rendered = renderCampaignEmail({
    subject,
    body: text,
    recipient: {
      accountEmail: "smoke-test@dokanai.app",
      customerId: "smoke-test",
      name: "there",
      email: to,
      locale: "en",
    },
    shopName: "DokanAI",
    origin,
  });

  const sent = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    unsubscribeUrl: rendered.unsubscribeUrl,
    idempotencyKey: `smoke:${to}:${Date.now()}`,
  });

  if (sent.ok) return NextResponse.json({ ok: true, providerId: sent.id, to });
  return NextResponse.json({ ok: false, to, reason: sent.reason, message: sent.message }, { status: 502 });
}
