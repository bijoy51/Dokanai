import { store } from "@/lib/data/store";
import type { Order } from "@/lib/types";

export interface RtoRisk {
  orderId: string;
  customerName: string;
  city: string;
  courier: string;
  total: number;
  riskScore: number; // 0..1
  riskLevel: "low" | "medium" | "high";
  factors: string[];
}

/**
 * Logistic-style RTO risk score.
 * Combines: city risk, courier risk, customer history (past RTO),
 * order size, payment method (COD only).
 */
function customerHistoryStats(customerId: string) {
  const past = store.orders.filter(
    (o) => o.customerId === customerId && (o.status === "delivered" || o.status === "rto")
  );
  const total = past.length;
  const rtos = past.filter((o) => o.status === "rto").length;
  return { total, rtos, rtoRate: total > 0 ? rtos / total : 0 };
}

const CITY_RISK: Record<string, number> = {
  Dhaka: 0.10,
  Chattogram: 0.12,
  Gazipur: 0.13,
  Narayanganj: 0.14,
  Khulna: 0.20,
  Sylhet: 0.22,
  Rajshahi: 0.24,
  Cumilla: 0.25,
  Mymensingh: 0.27,
  Barishal: 0.30,
};

const COURIER_RISK: Record<string, number> = {
  pathao: 0.10,
  steadfast: 0.12,
  redx: 0.14,
  ecourier: 0.16,
};

export function rtoRiskFor(order: Order): RtoRisk {
  const customer = store.customerById(order.customerId);
  const factors: string[] = [];

  let logit = -1.6; // base intercept
  if (order.paymentMethod === "cod") {
    logit += 1.0;
    factors.push("COD");
  } else {
    logit -= 1.5; // prepaid, very low RTO
  }

  const cityRisk = CITY_RISK[order.city] ?? 0.22;
  logit += (cityRisk - 0.18) * 6;
  if (cityRisk >= 0.22) factors.push(`Higher-risk city (${order.city})`);

  const courierRisk = COURIER_RISK[order.courier] ?? 0.14;
  logit += (courierRisk - 0.13) * 4;

  const hist = customerHistoryStats(order.customerId);
  if (hist.total >= 2 && hist.rtoRate >= 0.5) {
    logit += 1.2;
    factors.push(`Past RTO history (${hist.rtos}/${hist.total})`);
  } else if (hist.total >= 3 && hist.rtoRate === 0) {
    logit -= 1.0;
    factors.push("Reliable customer");
  }

  if (order.total >= 3000) {
    logit += 0.4;
    factors.push("High order value");
  } else if (order.total <= 500) {
    logit += 0.3;
    factors.push("Low value (impulse risk)");
  }

  // sigmoid
  const score = 1 / (1 + Math.exp(-logit));
  const level: RtoRisk["riskLevel"] = score >= 0.55 ? "high" : score >= 0.3 ? "medium" : "low";

  return {
    orderId: order.id,
    customerName: customer?.name ?? "·",
    city: order.city,
    courier: order.courier,
    total: order.total,
    riskScore: Number(score.toFixed(2)),
    riskLevel: level,
    factors,
  };
}

export function pendingCodRisks() {
  return store.orders
    .filter((o) => o.status === "pending" && o.paymentMethod === "cod")
    .map(rtoRiskFor)
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function rtoSummaryProjection() {
  const risks = pendingCodRisks();
  const totalRtoExpected = risks.reduce((s, r) => s + r.riskScore, 0);
  const highRiskCount = risks.filter((r) => r.riskLevel === "high").length;
  // If we require advance for all "high" orders, we eliminate their RTO contribution
  const reduced = risks
    .filter((r) => r.riskLevel !== "high")
    .reduce((s, r) => s + r.riskScore, 0);
  const totalOrders = risks.length;
  const beforePct = totalOrders ? (totalRtoExpected / totalOrders) * 100 : 0;
  const afterPct = totalOrders ? (reduced / totalOrders) * 100 : 0;
  return {
    totalOrders,
    highRiskCount,
    expectedRtoBefore: Number(beforePct.toFixed(1)),
    expectedRtoAfter: Number(afterPct.toFixed(1)),
    drop: Number((beforePct - afterPct).toFixed(1)),
  };
}
