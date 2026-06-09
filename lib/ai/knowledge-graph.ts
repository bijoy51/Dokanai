import { getStore, type Store } from "@/lib/data/store";
import { FESTIVALS } from "@/lib/data/festivals";
import type { Product } from "@/lib/types";

/**
 * Shop knowledge graph + subgraph retrieval — the retrieval half of GraphRAG.
 *
 * We build a typed, weighted graph in memory from the shop's real data:
 *
 *   nodes : product · customer · category · city · festival
 *   edges : (customer)-[bought]->(product)            w = units
 *           (product)-[co_purchased_with]->(product)  w = #orders together
 *           (product)-[in_category]->(category)
 *           (customer)-[lives_in]->(city)
 *           (festival)-[boosts]->(category)            w = peakBoost
 *
 * At query time linkEntities() maps the question to seed nodes, then
 * retrieveSubgraph() walks k hops out, ranks edges by weight, caps the size
 * and serialises the result to RDF-style triples. lib/ai/graph-rag.ts feeds
 * those triples to the LLM, which generates an answer grounded ONLY in them.
 *
 * Deterministic, in-memory, memoised per store — no vector DB required. The
 * graph is rebuilt only when the dataset changes (store cache identity).
 */

export type NodeType = "product" | "customer" | "category" | "city" | "festival";

export interface GraphNode {
  id: string; // `${type}:${rawId}`
  type: NodeType;
  label: string;
  labelBn?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  rel: string;
  weight: number;
  note?: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  /** adjacency: nodeId -> edges incident to it (both directions stored once each way) */
  adj: Map<string, GraphEdge[]>;
}

const pid = (id: string) => `product:${id}`;
const cid = (id: string) => `customer:${id}`;
const catId = (c: string) => `category:${c}`;
const cityId = (c: string) => `city:${c.toLowerCase()}`;
const fid = (id: string) => `festival:${id}`;

export function buildKnowledgeGraph(store: Store): KnowledgeGraph {
  const cached = store._cache.get("kgraph") as KnowledgeGraph | undefined;
  if (cached) return cached;

  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, GraphEdge[]>();
  const addNode = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdge = (from: string, to: string, rel: string, weight: number, note?: string) => {
    const e: GraphEdge = { from, to, rel, weight, note };
    (adj.get(from) ?? adj.set(from, []).get(from)!).push(e);
    (adj.get(to) ?? adj.set(to, []).get(to)!).push(e);
  };

  // ---- nodes: products + categories ----
  for (const p of store.products) {
    addNode({ id: pid(p.id), type: "product", label: p.name, labelBn: p.nameBn });
    addNode({ id: catId(p.category), type: "category", label: p.category });
    addEdge(pid(p.id), catId(p.category), "in_category", 1);
  }

  // ---- customers + cities ----
  for (const c of store.customers) {
    addNode({ id: cid(c.id), type: "customer", label: c.name });
    if (c.city) {
      addNode({ id: cityId(c.city), type: "city", label: c.city });
      addEdge(cid(c.id), cityId(c.city), "lives_in", 1);
    }
  }

  // ---- bought + co-purchase (from valid orders) ----
  const bought = new Map<string, number>(); // "cust|prod" -> units
  const coCount = new Map<string, number>(); // "a|b" (a<b) -> #orders together
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    const ids = [...new Set(o.items.map((i) => i.productId))];
    for (const it of o.items) {
      const k = `${o.customerId}|${it.productId}`;
      bought.set(k, (bought.get(k) ?? 0) + it.qty);
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const key = `${a}|${b}`;
        coCount.set(key, (coCount.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [k, units] of bought) {
    const [custId, prodId] = k.split("|");
    if (nodes.has(cid(custId)) && nodes.has(pid(prodId))) {
      addEdge(cid(custId), pid(prodId), "bought", units, `${units} units`);
    }
  }
  for (const [k, co] of coCount) {
    const [a, b] = k.split("|");
    if (nodes.has(pid(a)) && nodes.has(pid(b))) {
      addEdge(pid(a), pid(b), "co_purchased_with", co, `${co} orders together`);
    }
  }

  // ---- festivals -> categories ----
  for (const f of FESTIVALS) {
    addNode({ id: fid(f.id), type: "festival", label: f.name, labelBn: f.nameBn });
    for (const cat of f.categories) {
      if (nodes.has(catId(cat))) {
        addEdge(fid(f.id), catId(cat), "boosts", f.peakBoost, `peak ×${f.peakBoost}`);
      }
    }
  }

  const graph: KnowledgeGraph = { nodes, adj };
  store._cache.set("kgraph", graph);
  return graph;
}

/** Map a natural-language question to seed node ids by label matching. */
export function linkEntities(question: string, graph: KnowledgeGraph): string[] {
  const q = ` ${question.toLowerCase()} `;
  const seeds = new Set<string>();
  for (const node of graph.nodes.values()) {
    // customers are rarely named in questions and would over-seed; skip them
    if (node.type === "customer") continue;
    const label = node.label.toLowerCase();
    if (label.length < 3) continue;
    if (q.includes(` ${label} `) || q.includes(label)) seeds.add(node.id);
    if (node.labelBn && question.includes(node.labelBn)) seeds.add(node.id);
  }
  return [...seeds];
}

export interface Subgraph {
  triples: string[];
  seeds: string[];
  nodeCount: number;
  edgeCount: number;
}

/** Walk `hops` out from the seeds, rank edges by weight, cap, serialise. */
export function retrieveSubgraph(
  graph: KnowledgeGraph,
  seedIds: string[],
  hops = 2,
  maxEdges = 40,
): Subgraph {
  // Fallback: if nothing linked, seed from the highest-degree product nodes
  // so the graph query still returns something useful.
  let seeds = seedIds.filter((id) => graph.nodes.has(id));
  if (seeds.length === 0) {
    seeds = [...graph.nodes.values()]
      .filter((n) => n.type === "product")
      .map((n) => ({ id: n.id, deg: (graph.adj.get(n.id) ?? []).length }))
      .sort((a, b) => b.deg - a.deg)
      .slice(0, 3)
      .map((x) => x.id);
  }

  const visited = new Set<string>(seeds);
  const collected = new Map<string, GraphEdge>(); // edge key -> edge
  let frontier = [...seeds];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      const edges = (graph.adj.get(nodeId) ?? [])
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 12); // cap fan-out per node
      for (const e of edges) {
        const key = `${e.from}|${e.rel}|${e.to}`;
        if (!collected.has(key)) collected.set(key, e);
        const other = e.from === nodeId ? e.to : e.from;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  const label = (id: string) => graph.nodes.get(id)?.label ?? id;
  const ranked = [...collected.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxEdges);
  const triples = ranked.map((e) => {
    const base = `${label(e.from)} --[${e.rel}]--> ${label(e.to)}`;
    return e.note ? `${base} (${e.note})` : base;
  });

  return {
    triples,
    seeds: seeds.map(label),
    nodeCount: visited.size,
    edgeCount: ranked.length,
  };
}

/** Convenience: question -> retrieved subgraph for the signed-in shop. */
export function retrieveForQuestion(question: string): Subgraph {
  const store = getStore();
  const graph = buildKnowledgeGraph(store);
  const seeds = linkEntities(question, graph);
  return retrieveSubgraph(graph, seeds);
}

export type { Product };
