import { store } from "@/lib/data/store";
import type { Product } from "@/lib/types";

/**
 * Item-item collaborative filtering with cosine similarity.
 * Builds product vectors over customers (binary), computes similarity, ranks.
 */

let cachedSim: Map<string, Map<string, number>> | null = null;

function buildSimilarity(): Map<string, Map<string, number>> {
  if (cachedSim) return cachedSim;

  // Customer vectors per product (binary purchased)
  const buyers = new Map<string, Set<string>>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    for (const it of o.items) {
      if (!buyers.has(it.productId)) buyers.set(it.productId, new Set());
      buyers.get(it.productId)!.add(o.customerId);
    }
  }

  const sim = new Map<string, Map<string, number>>();
  const ids = [...buyers.keys()];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const A = buyers.get(a)!;
    if (!sim.has(a)) sim.set(a, new Map());
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      const B = buyers.get(b)!;
      let inter = 0;
      // small sets — direct intersection
      for (const x of A) if (B.has(x)) inter++;
      if (inter === 0) continue;
      const cos = inter / Math.sqrt(A.size * B.size);
      sim.get(a)!.set(b, cos);
      if (!sim.has(b)) sim.set(b, new Map());
      sim.get(b)!.set(a, cos);
    }
  }
  cachedSim = sim;
  return sim;
}

export interface CustomerSummary {
  id: string;
  name: string;
  city: string;
  ordersCount: number;
  totalSpent: number;
  lastOrder: string | null;
}

export function customerSummaries(limit = 60): CustomerSummary[] {
  const map = new Map<string, { count: number; total: number; last: string | null }>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    const cur = map.get(o.customerId) ?? { count: 0, total: 0, last: null as string | null };
    cur.count += 1;
    cur.total += o.total;
    if (!cur.last || o.date > cur.last) cur.last = o.date;
    map.set(o.customerId, cur);
  }
  return store.customers
    .map((c) => {
      const m = map.get(c.id) ?? { count: 0, total: 0, last: null };
      return {
        id: c.id,
        name: c.name,
        city: c.city,
        ordersCount: m.count,
        totalSpent: m.total,
        lastOrder: m.last,
      };
    })
    .filter((c) => c.ordersCount > 0)
    .sort((a, b) => b.ordersCount - a.ordersCount)
    .slice(0, limit);
}

export interface Recommendation {
  product: Product;
  score: number;
  reason: string;
}

export function recommendForCustomer(customerId: string, k = 6): Recommendation[] {
  const sim = buildSimilarity();
  const purchased = new Set<string>();
  for (const o of store.orders.filter((o) => o.customerId === customerId)) {
    for (const it of o.items) purchased.add(it.productId);
  }

  const scores = new Map<string, number>();
  for (const productId of purchased) {
    const neighbors = sim.get(productId);
    if (!neighbors) continue;
    for (const [otherId, s] of neighbors) {
      if (purchased.has(otherId)) continue;
      scores.set(otherId, (scores.get(otherId) ?? 0) + s);
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([pid, score]) => {
      const p = store.productById(pid)!;
      return {
        product: p,
        score: Number(score.toFixed(3)),
        reason: `Similar customers who bought your past items also bought this.`,
      };
    });

  // If history too sparse, fall back to category-popularity
  if (ranked.length < k) {
    const popular = popularByCategory(purchased);
    for (const r of popular) {
      if (ranked.find((x) => x.product.id === r.product.id)) continue;
      ranked.push(r);
      if (ranked.length >= k) break;
    }
  }

  return ranked;
}

function popularByCategory(exclude: Set<string>): Recommendation[] {
  const counts = new Map<string, number>();
  for (const o of store.orders) {
    for (const it of o.items) counts.set(it.productId, (counts.get(it.productId) ?? 0) + it.qty);
  }
  return store.products
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ product: p, score: counts.get(p.id) ?? 0, reason: "Best-seller in your store" }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function purchaseHistory(customerId: string) {
  const orders = store.orders.filter((o) => o.customerId === customerId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const items = orders.flatMap((o) =>
    o.items.map((i) => ({
      orderId: o.id,
      date: o.date,
      product: store.productById(i.productId)!,
      qty: i.qty,
      unitPrice: i.unitPrice,
    }))
  );
  return items.slice(0, 12);
}
