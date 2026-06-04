import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { answerQuery } from "@/lib/ai/voice-query";
import type { Locale } from "@/lib/i18n/messages";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const q = (body.q as string | undefined)?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "empty query" }, { status: 400 });

  // The UI sends its current locale so we can default the reply to the user's
  // chosen language when the speech itself has no clear language signal
  // (e.g. an English transcript on a Bengali-UI session).
  const localeIn = (body.locale as string | undefined)?.toLowerCase();
  const uiLocale: Locale = localeIn === "bn" ? "bn" : "en";

  // Hydrate the per-instance store from durable KV — same pattern the agent
  // chat and email-campaign routes use. Without this, every voice answer is
  // computed against an empty store on a cold serverless instance.
  await hydrateImported(session.email);

  return NextResponse.json(answerQuery(q, uiLocale));
}
