import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  dequeueDue,
  getCampaign,
  updateCampaign,
} from "@/lib/agent/store";

/**
 * DELETE /api/marketing/email-campaigns/[id]
 *
 * Cancels a scheduled email campaign:
 *   1. Patches its status to "cancelled" so the UI / Pilot tools reflect it.
 *   2. Removes it from the cross-account due-queue so the cron worker
 *      won't pick it up.
 *
 * Idempotent — calling it again on an already-cancelled campaign returns
 * the same shape. Returns 404 only if the campaign id doesn't exist.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = params.id?.trim();
  if (!id) return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });

  const existing = await getCampaign(session.email, id);
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (existing.status === "cancelled") {
    return NextResponse.json({ ok: true, id, status: "cancelled", note: "already cancelled" });
  }
  if (existing.status === "sent" || existing.status === "partial") {
    return NextResponse.json(
      { error: "Campaign has already been sent and can't be cancelled.", status: existing.status },
      { status: 409 },
    );
  }

  const updated = await updateCampaign(session.email, id, { status: "cancelled" });
  // Best-effort dequeue. Safe to call even if the item isn't in the queue.
  if (existing.channel === "email") {
    try {
      await dequeueDue({
        accountEmail: session.email,
        campaignId: id,
        scheduledFor: existing.scheduledFor,
      });
    } catch {
      /* non-fatal — status flip is the source of truth for the worker */
    }
  }
  return NextResponse.json({ ok: true, id, status: updated?.status ?? "cancelled" });
}
