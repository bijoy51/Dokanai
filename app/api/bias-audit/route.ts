import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { biasAudit } from "@/lib/ai/bias-audit";

export const dynamic = "force-dynamic";

/** GET /api/bias-audit — fairness/representation audit of the shop's AI outputs. */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  await hydrateImported(session.email);
  return NextResponse.json(biasAudit());
}
