import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCampaigns } from "@/lib/agent/store";

/** GET /api/agent/campaigns -> { campaigns: [...] } */
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const campaigns = await listCampaigns(session.email);
  return NextResponse.json({ campaigns });
}
