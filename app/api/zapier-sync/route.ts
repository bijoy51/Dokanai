import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createOrRotateWebhook,
  disableWebhook,
  getWebhookPublic,
} from "@/lib/zapierSync/store";

export const dynamic = "force-dynamic";

/**
 * Session-gated management API for the Zapier webhook.
 *
 * GET    /api/zapier-sync  -> { state: { shopId, lastPushAt, totalRowsEver, ... } | null }
 * POST   /api/zapier-sync  -> { shopId, token, webhookUrl }   (create OR rotate)
 * DELETE /api/zapier-sync  -> { ok: true }                     (disable + drop)
 *
 * The token-gated public endpoint at /api/zapier/webhook/[shopId] is the
 * actual data path. This route only manages the binding for the
 * dashboard UI. Two distinct routes deliberately so the public webhook
 * never accidentally inherits session-cookie auth behaviour.
 *
 * Token is ONLY returned by POST (create/rotate). GET never echoes it back —
 * preventing a leaked HAR file or replayed GET response from lifting it.
 */

function baseUrlOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const state = await getWebhookPublic(session.email);
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const creds = await createOrRotateWebhook(session.email, baseUrlOf(req));
  return NextResponse.json(creds);
}

export async function DELETE() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await disableWebhook(session.email);
  return NextResponse.json({ ok: true });
}
