import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported } from "@/lib/data/imported";
import { pendingCodRisks, rtoSummaryProjection } from "@/lib/ai/rto";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights/rto
 *
 * RTO (return-to-origin) risk for pending COD orders. Lets a developer
 * pipeline auto-flag risky orders in their own CRM or skip-delivery
 * workflow.
 *
 *   - summary       : aggregate stats (predicted RTO rate, COD value at risk)
 *   - high_risk     : pending COD orders with risk >= 0.6, sorted desc
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);

  const summary = rtoSummaryProjection();
  const risks = pendingCodRisks();
  const high_risk = risks
    .filter((r) => r.riskScore >= 0.6)
    .slice(0, 100)
    .map((r) => ({
      order_id: r.orderId,
      customer_name: r.customerName,
      city: r.city,
      courier: r.courier,
      total: r.total,
      risk_score: r.riskScore,
      risk_level: r.riskLevel,
      factors: r.factors,
    }));

  return NextResponse.json({ summary, high_risk });
}
