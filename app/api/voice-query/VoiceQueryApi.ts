import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { answerQuery } from "@/lib/ai/voice-query";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const q = (body.q as string | undefined)?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "empty query" }, { status: 400 });

  // Hydrate the per-instance store from durable KV — same pattern the agent
  // chat and email-campaign routes use. Without this, every voice answer is
  // computed against an empty store on a cold serverless instance.
  await hydrateImported(session.email);

  return NextResponse.json(answerQuery(q));
}
