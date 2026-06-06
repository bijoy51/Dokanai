import { NextResponse } from "next/server";
import { RATE_LIMIT_DAILY, readUsageFor, requireApiKey } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/usage
 *
 * Caller's current rate-limit usage. The dashboard's Developer tab also
 * polls this endpoint to show "today's calls / lifetime calls" without
 * needing a separate session-gated route.
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "any" });
  if ("error" in ctx) return ctx.error;
  const usage = await readUsageFor(ctx.email);
  return NextResponse.json({
    limit_daily: RATE_LIMIT_DAILY,
    today: usage?.count ?? 0,
    today_remaining: Math.max(0, RATE_LIMIT_DAILY - (usage?.count ?? 0)),
    total_ever: usage?.totalEver ?? 0,
    last_call_at: usage?.lastCallAt ? new Date(usage.lastCallAt).toISOString() : null,
    window_resets_at: new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1,
      ),
    ).toISOString(),
  });
}
