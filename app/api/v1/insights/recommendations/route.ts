import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported } from "@/lib/data/imported";
import { customerSummaries, recommendForCustomer } from "@/lib/ai/recommend";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights/recommendations?limit=20
 *
 * Returns per-customer product recommendations. Lets a developer wire
 * "what should we suggest to Customer X" into their own CRM, push
 * notifications, or email automation.
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 20);
  const k = clampInt(url.searchParams.get("k"), 1, 20, 6);

  const customers = customerSummaries(limit);
  const recs = customers.map((c) => ({
    customer_id: c.id,
    name: c.name,
    city: c.city,
    orders_count: c.ordersCount,
    lifetime_value: c.totalSpent,
    last_order_date: c.lastOrder,
    recommendations: recommendForCustomer(c.id, k).map((r) => ({
      product_id: r.product.id,
      name: r.product.name,
      name_bn: r.product.nameBn || undefined,
      category: r.product.category,
      price: r.product.price,
      score: r.score,
      reason: r.reason,
    })),
  }));

  return NextResponse.json({
    total: recs.length,
    recommendations: recs,
  });
}

function clampInt(v: string | null, min: number, max: number, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
