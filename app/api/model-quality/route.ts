import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { modelQuality } from "@/lib/ai/model-quality";

export const dynamic = "force-dynamic";

/** GET /api/model-quality — trained holdout metrics + live measurable shop signals. */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  await hydrateImported(session.email);
  return NextResponse.json(modelQuality());
}
