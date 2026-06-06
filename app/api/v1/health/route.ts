import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported, getImported } from "@/lib/data/imported";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health
 *
 * Light health probe. Returns the API version, server time, and the
 * caller's dataset freshness (products / customers / orders counts +
 * last-modified timestamp). Useful for monitoring dashboards.
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "any" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);
  const ds = getImported(ctx.email);
  return NextResponse.json({
    ok: true,
    version: "v1",
    server_time: new Date().toISOString(),
    dataset: {
      products: ds?.products.length ?? 0,
      customers: ds?.customers.length ?? 0,
      orders: ds?.orders.length ?? 0,
    },
  });
}
