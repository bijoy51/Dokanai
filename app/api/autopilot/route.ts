import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { autopilotPlan } from "@/lib/ai/autopilot";
import { hasTier } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/autopilot — the autonomous action plan.
 *
 * Gated: Growth+ gets the full plan, free accounts get a one-action preview
 * plus an upgrade prompt (the monetization loop, demonstrated on a NEW feature
 * so no existing free capability is removed).
 */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  await hydrateImported(session.email);

  const plan = autopilotPlan();
  const allowed = await hasTier(session.email, "growth");

  if (!allowed) {
    return NextResponse.json({
      locked: true,
      requiredTier: "growth",
      totalActions: plan.actions.length,
      preview: plan.actions.slice(0, 1),
      message: "Autopilot is a Growth feature. Upgrade on the Subscription page to unlock the full plan.",
    });
  }

  return NextResponse.json({ locked: false, ...plan });
}
