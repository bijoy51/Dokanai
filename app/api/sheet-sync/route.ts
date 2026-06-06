import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  clearConnection,
  getAccessTokenFor,
  getConnectionPublic,
  isOAuthConfigured,
} from "@/lib/google/oauth";
import { extractSheetId, getSpreadsheetMeta } from "@/lib/google/sheets";
import { clearBinding, getBinding, setBinding } from "@/lib/sheetSync/store";
import { runSheetSync } from "@/lib/sheetSync/runSync";

export const dynamic = "force-dynamic";

/**
 * GET    /api/sheet-sync
 *   -> { oauth: { connected, googleEmail?, lastError? } | null,
 *        binding: { sheetId, sheetTitle?, lastSyncAt, totalRowsEver, ... } | null }
 *
 * POST   /api/sheet-sync   body: { sheetIdOrUrl, sync?: boolean }
 *   - Validates the sheet ID, confirms we can read it with the user's
 *     stored Google token, persists the binding.
 *   - When `sync` is true (default), immediately reads + merges so the
 *     user sees data without waiting for the next Cron tick.
 *
 * DELETE /api/sheet-sync?google=1   -> revoke Google + drop binding
 * DELETE /api/sheet-sync            -> drop binding only (keep Google
 *                                       connection so user can rebind a
 *                                       different sheet without re-auth)
 *
 * All three are session-gated. The OAuth dance lives in /api/google/oauth/*.
 */

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 500 });
  }
  const [oauth, binding] = await Promise.all([
    getConnectionPublic(session.email),
    getBinding(session.email),
  ]);
  return NextResponse.json({
    oauth: oauth ? { connected: true, ...oauth } : null,
    binding: binding ?? null,
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 500 });
  }

  let body: { sheetIdOrUrl?: string; sync?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const sheetId = extractSheetId(body.sheetIdOrUrl ?? "");
  if (!sheetId) {
    return NextResponse.json(
      {
        error:
          "Couldn't read a Google Sheet ID from that input. Paste either the full sheet URL or the long ID from between /d/ and /edit.",
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await getAccessTokenFor(session.email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "refresh_failed";
    if (msg.includes("not_connected")) {
      return NextResponse.json(
        { error: "Sign in with Google first.", code: "not_connected" },
        { status: 412 },
      );
    }
    if (msg.includes("invalid_grant")) {
      // Refresh token was revoked from the user's Google account page.
      // Force a re-auth.
      await clearConnection(session.email);
      return NextResponse.json(
        { error: "Google access was revoked. Reconnect to continue.", code: "reauth_required" },
        { status: 412 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't get a Google access token. Try reconnecting.", code: "refresh_failed" },
      { status: 500 },
    );
  }

  // Probe the spreadsheet to verify we can read it before we bind it.
  // Surfaces 403/404 with a friendlier message than the raw API error.
  let meta;
  try {
    meta = await getSpreadsheetMeta(accessToken, sheetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sheet read failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const binding = await setBinding(session.email, sheetId, meta.properties.title);

  // Default to syncing right away so the UI shows data immediately.
  const doSync = body.sync !== false;
  if (!doSync) {
    return NextResponse.json({ ok: true, binding });
  }

  const result = await runSheetSync(
    session.email,
    accessToken,
    sheetId,
    binding.sheetTitle,
    "connect",
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const revokeGoogle = new URL(req.url).searchParams.get("google") === "1";
  await clearBinding(session.email);
  if (revokeGoogle) {
    await clearConnection(session.email);
  }
  return NextResponse.json({ ok: true, revokedGoogle: revokeGoogle });
}

/**
 * PUT /api/sheet-sync   -> manual "Sync now" button. Pulls the bound
 * sheet right now, merges, returns delta counts.
 */
export async function PUT() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 500 });
  }
  const binding = await getBinding(session.email);
  if (!binding) {
    return NextResponse.json({ error: "No sheet is bound. Paste a sheet ID first." }, { status: 412 });
  }
  let accessToken: string;
  try {
    accessToken = await getAccessTokenFor(session.email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "refresh_failed";
    if (msg.includes("invalid_grant")) {
      await clearConnection(session.email);
      return NextResponse.json(
        { error: "Google access was revoked. Reconnect to continue.", code: "reauth_required" },
        { status: 412 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't get a Google access token. Try reconnecting." },
      { status: 500 },
    );
  }
  const result = await runSheetSync(
    session.email,
    accessToken,
    binding.sheetId,
    binding.sheetTitle,
    "manual",
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
