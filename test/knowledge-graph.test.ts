import { describe, it, expect } from "vitest";
import type { Store } from "@/lib/data/store";
import type { Customer, Order, Product } from "@/lib/types";
import { buildKnowledgeGraph, linkEntities, retrieveSubgraph } from "@/lib/ai/knowledge-graph";

function makeStore(products: Product[], customers: Customer[], orders: Order[]): Store {
  return {
    products,
    customers,
    orders,
    productById: (id) => products.find((p) => p.id === id),
    customerById: (id) => customers.find((c) => c.id === id),
    ordersByCustomer: (id) => orders.filter((o) => o.customerId === id),
    ordersByProduct: (pid) => orders.filter((o) => o.items.some((i) => i.productId === pid)),
    _cache: new Map(),
  };
}

const products: Product[] = [
  { id: "p1", name: "Saree", nameBn: "শাড়ি", category: "clothing", price: 2000, cost: 1200, stock: 10, tags: [] },
  { id: "p2", name: "Petticoat", nameBn: "পেটিকোট", category: "clothing", price: 300, cost: 150, stock: 20, tags: [] },
];
const customers: Customer[] = [
  { id: "c1", name: "Rahima", phone: "0170", city: "Dhaka", joinedAt: "2026-01-01", preferredLang: "bn" },
];
const orders: Order[] = [
  {
    id: "o1",
    customerId: "c1",
    date: "2026-05-01",
    items: [
      { productId: "p1", qty: 1, unitPrice: 2000 },
      { productId: "p2", qty: 1, unitPrice: 300 },
    ],
    total: 2300,
    paymentMethod: "cod",
    status: "delivered",
    city: "Dhaka",
    courier: "pathao",
  },
];

describe("knowledge graph (GraphRAG retrieval)", () => {
  const graph = buildKnowledgeGraph(makeStore(products, customers, orders));

  it("builds typed nodes for products, categories, customers and cities", () => {
    expect(graph.nodes.has("product:p1")).toBe(true);
    expect(graph.nodes.has("category:clothing")).toBe(true);
    expect(graph.nodes.has("customer:c1")).toBe(true);
    expect(graph.nodes.has("city:dhaka")).toBe(true);
  });

  it("links a product named in the question to its node", () => {
    const seeds = linkEntities("what goes well with a Saree", graph);
    expect(seeds).toContain("product:p1");
  });

  it("retrieves a co-purchase relationship in the subgraph", () => {
    const seeds = linkEntities("Saree", graph);
    const sub = retrieveSubgraph(graph, seeds);
    expect(sub.triples.length).toBeGreaterThan(0);
    expect(sub.triples.join(" ")).toContain("co_purchased_with");
  });

  it("falls back to top products when nothing links", () => {
    const sub = retrieveSubgraph(graph, []);
    expect(sub.seeds.length).toBeGreaterThan(0);
  });
});
