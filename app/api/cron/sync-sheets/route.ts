import { NextResponse } from "next/server";
import { getAccessTokenFor, clearConnection } from "@/lib/google/oauth";
import { getBinding, listBoundEmails } from "@/lib/sheetSync/store";
import { runSheetSync } from "@/lib/sheetSync/runSync";
import { bearerOk } from "@/lib/security/bearerAuth";

export const dynamic = "force-dynamic";

/**
 * /api/cron/sync-sheets
 *
 * Vercel Cron entry point. Walks every shop that has a bound Google
 * Sheet and re-pulls it. Idempotent: mergeDataset() dedups by content
 * hash so re-running on an unchanged sheet is a no-op (and no
 * upload-history event is recorded).
 *
 * Auth: Bearer ${CRON_SECRET}. Without that header it returns 401 —
 * preventing public traffic from burning Google API quota.
 *
 * Schedule (vercel.json): every 5 minutes. Per-shop cost is one
 * spreadsheet metadata fetch + one values fetch per tab. Google's
 * default Sheets API quota is 300 read requests/minute per project, so
 * 5-min cadence comfortably scales to a few hundred shops.
 */

async function handle(req: Request): Promise<Response> {
  if (!bearerOk(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const emails = await listBoundEmails();
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const summaries: Array<{
    email: string;
    result: string;
    changed?: boolean;
    rowCount?: number;
  }> = [];

  for (const email of emails) {
    const binding = await getBinding(email);
    if (!binding) {
      summaries.push({ email, result: "skipped-no-binding" });
      continue;
    }
    let accessToken: string;
    try {
      accessToken = await getAccessTokenFor(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "refresh_failed";
      if (msg.includes("invalid_grant")) {
        // User revoked our access in their Google account. Clear the
        // OAuth blob so the UI can prompt for reconnect; leave the
        // sheet binding so we know what they had bound.
        await clearConnection(email);
        summaries.push({ email, result: "reauth_required" });
        continue;
      }
      summaries.push({ email, result: `refresh_failed:${msg.slice(0, 80)}` });
      continue;
    }
    const result = await runSheetSync(
      email,
      accessToken,
      binding.sheetId,
      binding.sheetTitle,
      "cron",
    );
    summaries.push({
      email,
      result: result.ok ? "ok" : `error:${(result.error ?? "").slice(0, 80)}`,
      changed: result.changed,
      rowCount: result.rowCount,
    });
  }

  return NextResponse.json({ ok: true, processed: summaries.length, summaries });
}

export const GET = handle;
export const POST = handle;
