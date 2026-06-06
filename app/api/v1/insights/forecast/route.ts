import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported } from "@/lib/data/imported";
import { dailyForecastTotal, forecastAll, festivalCalendar } from "@/lib/ai/forecast";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights/forecast
 *
 * Returns the demand-forecast bundle that powers the dashboard's Forecast
 * page. Three sections:
 *   - top_movers       : next-7-day demand winners (units)
 *   - dead_stock_risk  : items with >30 days of stock and >5 on-hand
 *   - daily_total      : aggregate units per day for the next 14 days
 *   - festival_window  : festivals in the next 60d with peak-boost multiplier
 *
 * Response shape is pinned for v1. Breaking changes ship under /api/v2.
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);

  const all = forecastAll();
  const top_movers = [...all]
    .sort((a, b) => b.forecastNext7 - a.forecastNext7)
    .slice(0, 10)
    .map((f) => ({
      product_id: f.productId,
      name: f.name,
      name_bn: f.nameBn || undefined,
      forecast_next_7d: f.forecastNext7,
      festival_boost: f.festivalBoost,
    }));
  const dead_stock_risk = [...all]
    .filter((f) => f.daysOfStock > 30 && f.stock > 5)
    .sort((a, b) => b.daysOfStock - a.daysOfStock)
    .slice(0, 10)
    .map((f) => ({
      product_id: f.productId,
      name: f.name,
      stock: f.stock,
      days_of_stock: Math.min(365, Math.round(f.daysOfStock)),
    }));
  const daily_total = dailyForecastTotal();
  const festival_window = festivalCalendar().map((f) => ({
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

  return NextResponse.json({
    top_movers,
    dead_stock_risk,
    daily_total,
    festival_window,
  });
}
