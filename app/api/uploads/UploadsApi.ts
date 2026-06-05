import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUploadHistory, hydrateUploadHistory } from "@/lib/data/upload-history";

/**
 * GET /api/uploads
 *
 * Returns the signed-in account's upload history (newest first), capped at
 * the MAX_EVENTS limit in lib/data/upload-history.ts.
 *
 * Response is private + short-cached (60s) so a user refreshing the
 * Uploads page rapidly doesn't hit the KV more than once per minute.
 */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  await hydrateUploadHistory(session.email);
  const events = getUploadHistory(session.email);
  return NextResponse.json(
    { events },
    {
      headers: {
        // Private cache only: same browser, 60-second TTL. Means a hard
        // refresh inside that window stays warm without a KV roundtrip.
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
