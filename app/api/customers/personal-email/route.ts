/**
 * POST /api/customers/personal-email
 *
 *   body: { customerId, action: "thank" | "upsell" | "coupon",
 *           subject, body, to? }
 *   -> { ok, providerId?, to, sendConfigured, reason?, message? }
 *
 * One-shot per-customer email sender wired to the "Thank you" / "Upsell" /
 * "Send coupon" buttons on /dashboard/customers. Unlike the campaign queue
 * (which is fan-out + cron-driven), this path sends ONE email synchronously
 * so the operator gets immediate feedback in the modal.
 *
 * Reuses the same template renderer + Resend client + unsubscribe-token
 * machinery as the campaign cron, so footers, headers, and unsubscribe
 * compliance are identical.
 *
 *   - `to` is optional. If omitted, we fall back to the customer record's
 *     stored email. If the record has no email either, we 400 — the modal
 *     prompts the operator to fill in the recipient field.
 *   - The customer's `subscribed` flag is NOT enforced here because the
 *     operator is sending a deliberate 1:1 reply, not a bulk blast. This
 *     matches how a shopkeeper would reach out from their personal inbox.
 *     Unsubscribe link is still appended for compliance.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { getStore } from "@/lib/data/store";
import { renderCampaignEmail } from "@/lib/email/template";
import { sendEmail, emailConfigured } from "@/lib/email/resend";
import { consumeQuota, rateLimitHeaders } from "@/lib/security/rateLimit";

const ALLOWED_ACTIONS = new Set(["thank", "upsell", "coupon"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-shop daily ceiling on 1:1 sends. The `to` override remains for
// legitimate use (fixing a typo in a customer's email), but it can't be
// used to turn the platform into a personal mail relay or phishing
// vector. 30/day is well above any real shopkeeper's outreach needs.
const PERSONAL_SEND_LIMIT_PER_DAY = 30;
const PERSONAL_WINDOW_SEC = 60 * 60 * 24;

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const quota = await consumeQuota(
    "personal-email",
    session.email,
    PERSONAL_SEND_LIMIT_PER_DAY,
    PERSONAL_WINDOW_SEC,
  );
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: `Daily personal-email limit reached (${PERSONAL_SEND_LIMIT_PER_DAY}/day). Try again after the window resets.`,
      },
      { status: 429, headers: rateLimitHeaders(quota, PERSONAL_SEND_LIMIT_PER_DAY) },
    );
  }

  let body: { customerId?: string; action?: string; subject?: string; body?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const customerId = (body.customerId ?? "").trim();
  const action = (body.action ?? "").toLowerCase().trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.body ?? "").trim();
  const toOverride = (body.to ?? "").trim();

  if (!customerId) return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "action must be one of: thank, upsell, coupon." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Body is required." }, { status: 400 });

  await hydrateImported(session.email);
  const customer = getStore().customerById(customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const to = (toOverride || customer.email || "").trim().toLowerCase();
  if (!to) {
    return NextResponse.json(
      { error: "No email on file for this customer. Add an email address to send." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Recipient email looks malformed." }, { status: 400 });
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        to,
        sendConfigured: false,
        reason: "not-configured",
        message: "Email provider not configured (RESEND_API_KEY / FROM_EMAIL).",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const origin = process.env.APP_ORIGIN?.trim() || `${url.protocol}//${url.host}`;
  const shopName = session.email.split("@")[0] || "Your shop";

  const rendered = renderCampaignEmail({
    subject,
    body: message,
    recipient: {
      accountEmail: session.email,
      customerId: customer.id,
      name: customer.name,
      email: to,
      locale: customer.preferredLang === "en" ? "en" : "bn",
    },
    shopName,
    origin,
  });

  const sent = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    unsubscribeUrl: rendered.unsubscribeUrl,
    // Action-scoped so re-sending the same action to the same customer
    // within a Resend retention window is idempotent on the provider side
    // (the in-app button doesn't lock — operator may legitimately resend).
    idempotencyKey: `personal:${session.email}:${customer.id}:${action}:${Date.now()}`,
  });

  if (sent.ok) {
    // Structured audit line — surfaces in Vercel logs so any abuse of
    // the `to` override (mass-sending to non-customer addresses from a
    // compromised account) is grep-able after the fact.
    console.log(
      JSON.stringify({
        evt: "personal_email.sent",
        account: session.email,
        customerId: customer.id,
        to,
        overrideUsed: toOverride !== "" && toOverride.toLowerCase() !== (customer.email ?? "").toLowerCase(),
        action,
        providerId: sent.id,
        ts: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      { ok: true, providerId: sent.id, to, sendConfigured: true },
      { headers: rateLimitHeaders(quota, PERSONAL_SEND_LIMIT_PER_DAY) },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      to,
      sendConfigured: true,
      reason: sent.reason,
      message: sent.message,
    },
    { status: 502, headers: rateLimitHeaders(quota, PERSONAL_SEND_LIMIT_PER_DAY) },
  );
}
