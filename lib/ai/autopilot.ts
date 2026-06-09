import { forecastAll } from "@/lib/ai/forecast";
import { rfmScores } from "@/lib/ai/churn";
import { pendingCodRisks } from "@/lib/ai/rto";

/**
 * Autopilot — the closed-loop layer. It reads the shop's live signals and
 * proposes a prioritised ACTION PLAN the owner can approve:
 *
 *   restock   — products about to stock out (from the demand forecaster)
 *   winback   — at-risk / dormant customers (from the RFM model)
 *   rto_guard — high-RTO pending COD orders (from the RTO risk model)
 *
 * It is deliberately READ-ONLY: it never sends a campaign or places an order
 * on its own. It composes existing models into one "what I'd do next" view,
 * which is the autonomy story without the risk of unattended actions.
 */

export interface AutopilotAction {
  priority: number;
  kind: "restock" | "winback" | "rto_guard";
  title: string;
  detail: string;
  impact: string;
}

export interface AutopilotPlan {
  generatedAt: string;
  actions: AutopilotAction[];
  summary: string;
}

export function autopilotPlan(): AutopilotPlan {
  const actions: AutopilotAction[] = [];

  // 1. Restock — soonest-to-stock-out products
  const low = forecastAll()
    .filter((f) => f.daysOfStock <= 10)
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 3);
  for (const f of low) {
    actions.push({
      priority: 0,
      kind: "restock",
      title: `Reorder ${f.name}`,
      detail: `About ${Math.round(f.daysOfStock)} days of stock left (${f.stock} units). Place a reorder now.`,
      impact: "Avoids a stockout and lost festival-season sales",
    });
  }

  // 2. Win-back — fading customers
  const fading = rfmScores().filter((s) => s.segment === "atrisk" || s.segment === "dormant");
  if (fading.length > 0) {
    actions.push({
      priority: 0,
      kind: "winback",
      title: `Win back ${fading.length} fading customers`,
      detail: `${fading.length} at-risk / dormant buyers. Draft a 10-15% win-back offer and schedule it from Auto-Marketing.`,
      impact: "Recovers repeat revenue from customers you already have",
    });
  }

  // 3. RTO guard — high-risk pending COD
  const highRto = pendingCodRisks().filter((r) => r.riskLevel === "high");
  if (highRto.length > 0) {
    actions.push({
      priority: 0,
      kind: "rto_guard",
      title: `Guard ${highRto.length} high-RTO orders`,
      detail: `${highRto.length} pending COD orders are high RTO risk. Confirm by call or take a partial advance before shipping.`,
      impact: "Cuts cash-on-delivery return losses",
    });
  }

  actions.forEach((a, i) => (a.priority = i + 1));

  const summary = actions.length
    ? `${actions.length} action(s) proposed: ${[...new Set(actions.map((a) => a.kind))].join(", ")}.`
    : "All clear — no urgent actions right now.";

  return { generatedAt: new Date().toISOString(), actions, summary };
}
