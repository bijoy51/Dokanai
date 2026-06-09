import { getStore, type Store } from "@/lib/data/store";
import type { Product } from "@/lib/types";

/**
 * Product co-purchase affinity graph (a graph-based recommender).
 *
 * Distinct from the cosine item-to-item model in recommend.ts. Here the nodes
 * are products and an edge between two products is weighted by how often they
 * appear together in the same order (a co-purchase count), normalised to a
 * Jaccard affinity in [0, 1]:
 *
 *     affinity(a, b) = co(a, b) / ( orders(a) + orders(b) - co(a, b) )
 *
 * Recommendations are produced by traversing the graph one hop out from a seed
 * product (or from every product a customer has bought) and ranking the
 * strongest-connected neighbours by summed affinity.
 *
 * This is honest "graph-based affinity retrieval" — NOT GraphRAG. There is no
 * embedding store and no LLM generation step; the graph is built in memory
 * from the shop's real orders and traversed deterministically. The Pilot agent
 * can call it as a tool, but the agent only narrates the graph's output.
 */

interface Edge {
  other: string;
  coPurchases: number;
  affinity: number;
}

interface AffinityGraph {
  /** productId -> neighbours, sorted descending by affinity */
  adj: Map<string, Edge[]>;
  /** productId -> number of valid (non rto/cancelled) orders containing it */
  orderCount: Map<string, number>;
}

function buildGraph(store: Store): AffinityGraph {
  const cached = store._cache.get("affinity") as AffinityGraph | undefined;
  if (cached) return cached;

  const orderCount = new Map<string, number>();
  const pair = new Map<string, number>(); // "a|b" with a < b -> co-purchase count

  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    // Unique product ids in this order — multi-line orders are the edges.
    const ids = [...new Set(o.items.map((i) => i.productId))];
    for (const id of ids) orderCount.set(id, (orderCount.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const key = `${a}|${b}`;
        pair.set(key, (pair.get(key) ?? 0) + 1);
      }
    }
  }

  const adj = new Map<string, Edge[]>();
  const push = (from: string, e: Edge) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(e);
  };
  for (const [key, co] of pair) {
    const [a, b] = key.split("|");
    const denom = (orderCount.get(a) ?? 0) + (orderCount.get(b) ?? 0) - co;
    const affinity = denom > 0 ? co / denom : 0;
    push(a, { other: b, coPurchases: co, affinity });
    push(b, { other: a, coPurchases: co, affinity });
  }
  for (const list of adj.values()) list.sort((x, y) => y.affinity - x.affinity);

  const graph: AffinityGraph = { adj, orderCount };
  store._cache.set("affinity", graph);
  return graph;
}

export interface AffinityRec {
  product: Product;
  /** summed Jaccard affinity across the seed set (higher = more connected) */
  score: number;
  /** total co-purchases with the seed set */
  coPurchases: number;
  /** name of the seed product this candidate is most strongly linked to */
  via: string;
}

export interface AffinityResult {
  seeds: Product[];
  recommendations: AffinityRec[];
}

/** Resolve a product by id, exact name (en or bn), then fuzzy contains. */
function resolveProduct(store: Store, idOrName: string): Product | undefined {
  const byId = store.productById(idOrName);
  if (byId) return byId;
  const q = idOrName.trim();
  const ql = q.toLowerCase();
  return (
    store.products.find((p) => p.name.toLowerCase() === ql || p.nameBn === q) ??
    store.products.find((p) => p.name.toLowerCase().includes(ql) || (p.nameBn ?? "").includes(q))
  );
}

/**
 * Graph-based recommendations from a seed product (id or name) or a customer's
 * purchase history. Traverses one hop out and ranks neighbours by affinity.
 */
export function affinityRecommendations(opts: {
  productId?: string;
  productName?: string;
  customerId?: string;
  k?: number;
}): AffinityResult {
  const store = getStore();
  const k = Math.min(Math.max(Number(opts.k) || 6, 1), 20);
  const graph = buildGraph(store);

  const seedIds = new Set<string>();
  const seedArg = opts.productId || opts.productName;
  if (seedArg) {
    const p = resolveProduct(store, seedArg);
    if (p) seedIds.add(p.id);
  }
  if (opts.customerId) {
    for (const o of store.ordersByCustomer(opts.customerId)) {
      if (o.status === "rto" || o.status === "cancelled") continue;
      for (const it of o.items) seedIds.add(it.productId);
    }
  }

  const seeds = [...seedIds]
    .map((id) => store.productById(id))
    .filter((p): p is Product => Boolean(p));
  if (seeds.length === 0) return { seeds: [], recommendations: [] };

  const score = new Map<string, number>();
  const co = new Map<string, number>();
  const bestVia = new Map<string, { name: string; aff: number }>();

  for (const seed of seeds) {
    for (const e of graph.adj.get(seed.id) ?? []) {
      if (seedIds.has(e.other)) continue; // don't recommend what they already have
      score.set(e.other, (score.get(e.other) ?? 0) + e.affinity);
      co.set(e.other, (co.get(e.other) ?? 0) + e.coPurchases);
      const prev = bestVia.get(e.other);
      if (!prev || e.affinity > prev.aff) bestVia.set(e.other, { name: seed.name, aff: e.affinity });
    }
  }

  const recommendations: AffinityRec[] = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([pid, s]) => ({
      product: store.productById(pid)!,
      score: Number(s.toFixed(3)),
      coPurchases: co.get(pid) ?? 0,
      via: bestVia.get(pid)?.name ?? seeds[0].name,
    }));

  return { seeds, recommendations };
}
