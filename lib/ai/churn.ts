import { getStore } from "@/lib/data/store";
import { daysBetween } from "@/lib/utils";
import type { ProductCategory } from "@/lib/types";

export type Segment = "vip" | "loyal" | "atrisk" | "dormant" | "new";

/**
 * Per-category churn windows from the production architecture spec
 * (PDF §2.3). The pattern is "no purchase in N days" → at-risk; "no
 * purchase in M days" → churned. These are also the labels the XGBoost
 * predictor in ml-backend was trained against, so frontend and backend
 * agree on what "at-risk" means.
 *
 * These thresholds are READ-ONLY metadata — they don't change the
 * existing rfmScores() output (which still uses its global buckets),
 * so existing dashboards and the Pilot list_customers_by_segment tool
 * continue to behave exactly as before. The thresholds are used by the
 * ML-backed churn predictor (lib/ai/churn-ml.ts) and the new Pilot
 * tool predict_churn_for_customer.
 */
export interface ChurnThresholds {
  atRiskDays: number;
  churnedDays: number;
  keyDriver: string;
}

export const CATEGORY_CHURN_THRESHOLDS: Record<ProductCategory, ChurnThresholds> = {
  food:        { atRiskDays: 21, churnedDays: 45,  keyDriver: "missed weekly shop" },
  electronics: { atRiskDays: 90, churnedDays: 180, keyDriver: "upgrade cycle deviation" },
  beauty:      { atRiskDays: 45, churnedDays: 90,  keyDriver: "restock cycle missed" },
  clothing:    { atRiskDays: 60, churnedDays: 120, keyDriver: "seasonal window skipped" },
  home:        { atRiskDays: 60, churnedDays: 120, keyDriver: "no repeat purchase" },
};

/** Fallback when the category isn't known — uses the clothing curve. */
export const DEFAULT_CHURN_THRESHOLDS: ChurnThresholds = CATEGORY_CHURN_THRESHOLDS.clothing;

export function thresholdsFor(category?: ProductCategory | string): ChurnThresholds {
  if (category && (category as ProductCategory) in CATEGORY_CHURN_THRESHOLDS) {
    return CATEGORY_CHURN_THRESHOLDS[category as ProductCategory];
  }
  return DEFAULT_CHURN_THRESHOLDS;
}

export interface CustomerScore {
  customerId: string;
  name: string;
  city: string;
  recency: number;
  frequency: number;
  monetary: number;
  rfmScore: number;
  segment: Segment;
}

/**
 * Recency-Frequency-Monetary scoring. Each dimension scored 1-5,
 * combined weighted to assign a segment.
 */
export function rfmScores(): CustomerScore[] {
  const store = getStore();
  const today = new Date();
  const out: CustomerScore[] = [];
  for (const c of store.customers) {
    const orders = store.ordersByCustomer(c.id).filter((o) => o.status !== "cancelled");
    if (orders.length === 0) continue;
    const lastDate = orders.reduce((max, o) => (o.date > max ? o.date : max), orders[0].date);
    const recency = daysBetween(lastDate, today);
    const frequency = orders.length;
    const monetary = orders.reduce((s, o) => s + o.total, 0);

    // Bucketize
    const rScore = recency <= 14 ? 5 : recency <= 30 ? 4 : recency <= 60 ? 3 : recency <= 90 ? 2 : 1;
    const fScore = frequency >= 8 ? 5 : frequency >= 5 ? 4 : frequency >= 3 ? 3 : frequency >= 2 ? 2 : 1;
    const mScore = monetary >= 15000 ? 5 : monetary >= 8000 ? 4 : monetary >= 4000 ? 3 : monetary >= 2000 ? 2 : 1;

    const rfmScore = rScore * 0.4 + fScore * 0.3 + mScore * 0.3;
    let segment: Segment;
    if (rScore >= 4 && fScore >= 4 && mScore >= 4) segment = "vip";
    else if (rScore >= 4 && fScore >= 3) segment = "loyal";
    else if (rScore <= 2 && fScore >= 3) segment = "atrisk";
    else if (rScore <= 2) segment = "dormant";
    else segment = "new";

    out.push({
      customerId: c.id,
      name: c.name,
      city: c.city,
      recency,
      frequency,
      monetary,
      rfmScore: Number(rfmScore.toFixed(2)),
      segment,
    });
  }
  out.sort((a, b) => b.rfmScore - a.rfmScore);
  return out;
}

export interface SegmentSummary {
  segment: Segment;
  count: number;
  avgSpent: number;
}

export function segmentBreakdown(): SegmentSummary[] {
  const all = rfmScores();
  const groups = new Map<Segment, { count: number; total: number }>();
  for (const c of all) {
    const cur = groups.get(c.segment) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += c.monetary;
    groups.set(c.segment, cur);
  }
  return [...groups.entries()].map(([segment, v]) => ({
    segment,
    count: v.count,
    avgSpent: Math.round(v.total / v.count),
  }));
}
