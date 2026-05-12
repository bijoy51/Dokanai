import { getStore } from "@/lib/data/store";
import { daysBetween } from "@/lib/utils";

export type Segment = "vip" | "loyal" | "atrisk" | "dormant" | "new";

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
