import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported } from "@/lib/data/imported";
import { festivalCalendar } from "@/lib/ai/forecast";
import { nextFestival } from "@/lib/data/festivals";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights/festivals
 *
 * Festival outlook for the next 60 days, plus the chronologically next
 * festival regardless of horizon (helpful when the 60-day window is empty).
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);

  const window = festivalCalendar().map((f) => ({
    id: f.id,
    name: f.name,
    name_bn: f.nameBn,
    date: f.date,
    lead_days: f.leadDays,
    peak_boost: f.peakBoost,
    categories: f.categories,
    advice_en: f.advice,
    advice_bn: f.adviceBn,
  }));

  const next = nextFestival(new Date());

  return NextResponse.json({
    window,
    next_ever: next
      ? {
          id: next.id,
          name: next.name,
          name_bn: next.nameBn,
          date: next.date,
          peak_boost: next.peakBoost,
          advice_en: next.advice,
          advice_bn: next.adviceBn,
        }
      : null,
  });
}
