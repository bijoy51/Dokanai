import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createOrRotate,
  disconnect,
  getSyncPublic,
} from "@/lib/sheetSync/store";

/**
 * GET    /api/sheet-sync  -> { state: { shopId, lastSyncAt, totalRowsEver, ... } | null }
 * POST   /api/sheet-sync  -> { shopId, token, webhookUrl }    (rotate / create)
 * DELETE /api/sheet-sync  -> { ok: true }                      (disconnect)
 *
 * Session-gated. Sits behind the same login the rest of the dashboard
 * uses — the WEBHOOK itself (in /api/import/webhook/[shopId]) is
 * session-free and gated by token. These are the two halves of Path A.
 *
 * The token is ONLY returned by POST, never by GET — once the user
 * pastes it into their Apps Script we shouldn't keep echoing it back
 * (so a stolen GET response or leaked HAR file can't lift it).
 */

const DEMO = "demo@dokanai.app";

function baseUrlOf(req: Request): string {
  // Prefer the Host header (works on Vercel, includes the custom domain
  // if any), fall back to the request URL's origin.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const state = await getSyncPublic(session.email);
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.email === DEMO) {
    return NextResponse.json(
      { error: "The demo account uses sample data and cannot have a live sync." },
      { status: 403 },
    );
  }
  const creds = await createOrRotate(session.email, baseUrlOf(req));
  return NextResponse.json(creds);
}

export async function DELETE() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await disconnect(session.email);
  return NextResponse.json({ ok: true });
}
