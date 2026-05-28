import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { addCampaign } from "@/lib/agent/store";
import { resolveAudience } from "@/lib/email/audience";
import { emailConfigured } from "@/lib/email/resend";

/**
 * POST /api/marketing/email-campaigns
 *   body: { audience: "vip" | "rto" | "atrisk", subject, body, scheduledFor }
 *   -> { ok, id, scheduledFor, reach, sendConfigured, note }
 *
 * Directly schedules an email campaign from the Auto-Marketing UI (the
 * Email Composer card). Same persistence path the Pilot agent uses, so the
 * cron worker picks it up identically.
 *
 * No campaign-listing endpoint is exposed here — the Auto-Marketing page
 * intentionally does NOT show a list of scheduled emails (per product
 * decision). The user can still see them through Pilot's `list_recent_campaigns`.
 */
const ALLOWED_AUDIENCES = new Set(["vip", "rto", "atrisk"]);

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { audience?: string; subject?: string; body?: string; scheduledFor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const audience = (body.audience ?? "").toLowerCase().trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.body ?? "").trim();
  const scheduledForRaw = (body.scheduledFor ?? "").trim();

  if (!ALLOWED_AUDIENCES.has(audience)) {
    return NextResponse.json({ error: "audience must be one of: vip, rto, atrisk." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Email body is required." }, { status: 400 });
  if (!scheduledForRaw) return NextResponse.json({ error: "Schedule time is required." }, { status: 400 });

  // Normalise to ISO 8601. The browser <input type=datetime-local> sends a
  // value like "2026-05-29T18:00" with no timezone — treat that as the local
  // browser time, which for our Bangladesh users is Asia/Dhaka (UTC+6).
  let scheduledForIso: string;
  try {
    scheduledForIso = normaliseScheduledFor(scheduledForRaw);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid schedule time." }, { status: 400 });
  }

  // Hydrate so the audience preview reflects the live store on this instance.
  await hydrateImported(session.email);
  const preview = resolveAudience(audience);

  const created = await addCampaign(session.email, {
    channel: "email",
    audience,
    message,
    subject,
    scheduledFor: scheduledForIso,
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    scheduledFor: created.scheduledFor,
    reach: preview.stats,
    sendConfigured: emailConfigured(),
  });
}

function normaliseScheduledFor(input: string): string {
  // Already an ISO 8601 with timezone -> trust it.
  if (/Z|[+-]\d{2}:?\d{2}$/.test(input)) {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime.");
    return d.toISOString();
  }
  // datetime-local format YYYY-MM-DDTHH:mm[:ss] -> assume Asia/Dhaka (UTC+6).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (!m) {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime.");
    return d.toISOString();
  }
  const [, y, mo, d, hh, mm, ss] = m;
  // Construct a Date as if the value were UTC, then subtract 6h to get the
  // real UTC instant of that wall-clock time in Asia/Dhaka.
  const utcWall = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss ?? "0"));
  const dhakaInstant = utcWall - 6 * 60 * 60 * 1000;
  return new Date(dhakaInstant).toISOString();
}
