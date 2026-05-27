/**
 * /api/cron/run-due-campaigns
 *
 * Worker that the platform cron (vercel.json) hits on a schedule. Picks up
 * email campaigns whose scheduledFor <= now, expands the audience, sends
 * one email per opted-in recipient via Resend, and records per-recipient
 * state idempotently. Safe to re-run: a recipient that already has a
 * non-failed record is skipped.
 *
 * Auth: must be invoked with Authorization: Bearer ${CRON_SECRET}. Vercel
 * cron sends this automatically when CRON_SECRET is set in env. Manual
 * trigger via curl works the same way.
 *
 * Without RESEND_API_KEY / FROM_EMAIL the worker still runs and dequeues
 * due campaigns, but every recipient is marked `failed` with reason
 * "not-configured" so the campaign visibly "ran" — the operator can see
 * exactly why no emails went out.
 */
import { NextResponse } from "next/server";
import {
  dequeueDue,
  getCampaign,
  listDue,
  putRecipientRecord,
  getRecipientRecord,
  updateCampaign,
  type Campaign,
  type DueItem,
  type RecipientRecord,
} from "@/lib/agent/store";
import { hydrateImported } from "@/lib/data/imported";
import { resolveAudience, type Recipient } from "@/lib/email/audience";
import { renderCampaignEmail } from "@/lib/email/template";
import { sendEmail } from "@/lib/email/resend";

function authOk(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    // No CRON_SECRET configured -> refuse to run (don't let public traffic
    // burn through OpenAI / Resend quota). Set CRON_SECRET in Vercel env to
    // activate the worker.
    return false;
  }
  const got = req.headers.get("authorization") ?? "";
  return got === `Bearer ${expected}`;
}

function originFromReq(req: Request): string {
  const url = new URL(req.url);
  return process.env.APP_ORIGIN?.trim() || `${url.protocol}//${url.host}`;
}

async function handle(req: Request): Promise<Response> {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const nowIso = new Date().toISOString();
  const due = await listDue(nowIso);
  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, now: nowIso });
  }

  const origin = originFromReq(req);
  const summaries: Array<{ campaignId: string; accountEmail: string; result: string; stats?: Campaign["stats"] }> = [];

  for (const item of due) {
    try {
      const summary = await runOne(item, origin);
      summaries.push({ campaignId: item.campaignId, accountEmail: item.accountEmail, result: summary.result, stats: summary.stats });
    } catch (e) {
      summaries.push({
        campaignId: item.campaignId,
        accountEmail: item.accountEmail,
        result: `error:${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: summaries.length, now: nowIso, summaries });
}

async function runOne(item: DueItem, origin: string): Promise<{ result: string; stats?: Campaign["stats"] }> {
  const campaign = await getCampaign(item.accountEmail, item.campaignId);
  if (!campaign) {
    await dequeueDue(item);
    return { result: "skipped-missing" };
  }
  if (campaign.status === "cancelled") {
    await dequeueDue(item);
    return { result: "skipped-cancelled" };
  }
  if (campaign.channel !== "email") {
    // Other channels are record-only in v1 — leave them and mark sent so
    // they don't keep getting re-queued.
    await updateCampaign(item.accountEmail, item.campaignId, { status: "sent", finishedAt: new Date().toISOString() });
    await dequeueDue(item);
    return { result: "skipped-non-email" };
  }

  // Mark in-progress so a concurrent cron sees the work is taken.
  await updateCampaign(item.accountEmail, item.campaignId, { status: "in_progress", startedAt: new Date().toISOString() });

  // Hydrate this instance's in-memory store from the durable dataset before
  // resolving the audience — the cron lambda almost certainly hasn't served
  // this account before this minute.
  await hydrateImported(item.accountEmail);

  const resolved = resolveAudience(campaign.audience);
  const recipients = resolved.recipients;

  const shopName = item.accountEmail.split("@")[0] || "Your shop";
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    // Idempotency: skip recipients we already processed in a prior cron tick.
    const prior = await getRecipientRecord(item.accountEmail, item.campaignId, r.customerId);
    if (prior && prior.state !== "failed" && prior.state !== "queued") {
      if (prior.state === "sent") sent += 1;
      continue;
    }
    const result = await sendOne(campaign, r, shopName, origin, item.accountEmail);
    if (result.state === "sent") sent += 1;
    else failed += 1;
    await putRecipientRecord(item.accountEmail, item.campaignId, result);
  }

  const stats: Campaign["stats"] = {
    audience: resolved.stats.audienceCount,
    withEmail: resolved.stats.withEmail,
    optedIn: resolved.stats.optedIn,
    sent,
    failed,
    unsubscribed: 0,
  };
  const finalStatus: Campaign["status"] =
    recipients.length === 0
      ? "sent"
      : failed === 0
        ? "sent"
        : sent === 0
          ? "failed"
          : "partial";
  await updateCampaign(item.accountEmail, item.campaignId, {
    status: finalStatus,
    stats,
    finishedAt: new Date().toISOString(),
  });
  await dequeueDue(item);
  return { result: `${finalStatus}:${sent}/${recipients.length}`, stats };
}

async function sendOne(
  campaign: Campaign,
  r: Recipient,
  shopName: string,
  origin: string,
  accountEmail: string,
): Promise<RecipientRecord> {
  const rendered = renderCampaignEmail({
    subject: campaign.subject || (r.locale === "bn" ? "আপনার জন্য একটা অফার" : "An offer for you"),
    body: campaign.message,
    recipient: {
      accountEmail,
      customerId: r.customerId,
      name: r.name,
      email: r.email,
      locale: r.locale,
    },
    shopName,
    origin,
    cta: campaign.ctaUrl && campaign.ctaLabel ? { url: campaign.ctaUrl, label: campaign.ctaLabel } : undefined,
  });
  const result = await sendEmail({
    to: r.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    unsubscribeUrl: rendered.unsubscribeUrl,
    idempotencyKey: `${campaign.id}:${r.customerId}`,
  });
  const ts = Date.now();
  if (result.ok) {
    return { customerId: r.customerId, email: r.email, state: "sent", providerId: result.id, ts };
  }
  return {
    customerId: r.customerId,
    email: r.email,
    state: "failed",
    errorReason: result.reason,
    errorMessage: result.message,
    ts,
  };
}

export const GET = handle;
export const POST = handle;
