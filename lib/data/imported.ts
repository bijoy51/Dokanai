/**
 * Per-account imported shop data.
 *
 * Holds datasets a shop owner uploaded via CSV. Storage is an in-memory
 * Map keyed by account email. Because Vercel serverless instances are
 * stateless, the browser also keeps a localStorage mirror and the
 * DataSync component re-POSTs it after a cold start (see components/DataSync).
 *
 * The demo account does NOT use this module — it always gets the synthetic
 * seed (see lib/data/store.ts).
 */
import type { Customer, Order, OrderItem, Product, ProductCategory, DeliveryStatus } from "@/lib/types";
import { kvConfigured, kvGet, kvPut, kvDelete } from "@/lib/kv";

export interface Dataset {
  products: Product[];
  customers: Customer[];
  orders: Order[];
}

const store = new Map<string, Dataset>();

const norm = (email: string) => email.trim().toLowerCase();

// ---------- in-memory cache (synchronous, used by getStore) ----------

export function setImported(email: string, d: Dataset): void {
  store.set(norm(email), d);
}
export function getImported(email: string): Dataset | undefined {
  return store.get(norm(email));
}
export function hasImported(email: string): boolean {
  return store.has(norm(email));
}
export function clearImported(email: string): void {
  store.delete(norm(email));
}

// ---------- durable persistence (shared KV) ----------
// The in-memory Map is per-instance and lost on a Vercel cold start, so the
// dataset is also written to the shared KV. hydrateImported() pulls it back
// into the Map at the start of a request (see the dashboard layout), which is
// what lets the synchronous getStore() path find the data on any instance.

const kvKey = (email: string) => `dataset:${norm(email)}`;

function isDataset(v: unknown): v is Dataset {
  const d = v as Partial<Dataset> | null;
  return !!d && Array.isArray(d.products) && Array.isArray(d.customers) && Array.isArray(d.orders);
}

/** Persist a dataset durably. Best-effort: in-memory + mirror are backups. */
export async function persistImported(email: string, d: Dataset): Promise<boolean> {
  return kvPut(kvKey(email), d);
}

/**
 * Ensure this instance's Map has the account's dataset, pulling it from the
 * KV on a cache miss. No-op when the KV isn't configured (local dev) or the
 * account already has data cached on this instance.
 */
export async function hydrateImported(email: string): Promise<void> {
  if (!kvConfigured()) return;
  const e = norm(email);
  if (store.has(e)) return;
  const d = await kvGet<Dataset>(kvKey(e));
  if (isDataset(d)) store.set(e, d);
}

/** Clear an account's dataset from both the cache and the KV. */
export async function removeImported(email: string): Promise<void> {
  clearImported(email);
  await kvDelete(kvKey(email));
}

// ---------- CSV-row -> Dataset builder ----------

export interface RawProduct {
  name?: string;
  title?: string;
  category?: string;
  price?: number | string;
  cost?: number | string;
  stock?: number | string;
}

export interface RawSale {
  date?: string;
  product?: string;
  qty?: number | string;
  unit_price?: number | string;
  price?: number | string;
  customer?: string;
  payment?: string;
  status?: string;
  city?: string;
}

const KNOWN_CATEGORIES: ProductCategory[] = ["clothing", "electronics", "beauty", "food", "home"];
const KNOWN_STATUS: DeliveryStatus[] = ["delivered", "rto", "pending", "cancelled"];
const KNOWN_PAYMENT = ["cod", "bkash", "nagad", "card"] as const;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function coerceCategory(c: string | undefined): ProductCategory {
  const v = (c ?? "").trim().toLowerCase();
  return (KNOWN_CATEGORIES as string[]).includes(v) ? (v as ProductCategory) : "home";
}
function coerceStatus(s: string | undefined): DeliveryStatus {
  const v = (s ?? "").trim().toLowerCase();
  return (KNOWN_STATUS as string[]).includes(v) ? (v as DeliveryStatus) : "delivered";
}
function coercePayment(p: string | undefined): Order["paymentMethod"] {
  const v = (p ?? "").trim().toLowerCase();
  return (KNOWN_PAYMENT as readonly string[]).includes(v) ? (v as Order["paymentMethod"]) : "cod";
}

/**
 * Build a full Dataset from uploaded product + sales rows.
 * - products.csv is optional; products referenced only in sales are created.
 * - sales.csv is optional; without it the catalog still shows.
 * - a `customer` column in sales unlocks customer-level features; without
 *   it all orders fall under a single "Walk-in customers" record.
 */
export function buildDataset(rawProducts: RawProduct[], rawSales: RawSale[]): Dataset {
  const products: Product[] = [];
  const productByName = new Map<string, Product>();

  const addProduct = (name: string, category: string | undefined, price: number, cost: number, stock: number) => {
    const key = name.trim().toLowerCase();
    if (!key || productByName.has(key)) return productByName.get(key)!;
    const p: Product = {
      id: `p${String(products.length + 1).padStart(3, "0")}`,
      name: name.trim(),
      nameBn: name.trim(),
      category: coerceCategory(category),
      price,
      cost: cost > 0 ? cost : Math.round(price * 0.6),
      stock,
      tags: [],
    };
    products.push(p);
    productByName.set(key, p);
    return p;
  };

  for (const rp of rawProducts) {
    const name = (rp.name ?? rp.title ?? "").trim();
    if (!name) continue;
    addProduct(name, rp.category, toNum(rp.price), toNum(rp.cost), toNum(rp.stock));
  }

  // Products that appear only in sales get created with stock 0.
  for (const s of rawSales) {
    const name = (s.product ?? "").trim();
    if (name && !productByName.has(name.toLowerCase())) {
      addProduct(name, undefined, toNum(s.unit_price ?? s.price), 0, 0);
    }
  }

  const customers: Customer[] = [];
  const customerByName = new Map<string, Customer>();
  const WALK_IN_ID = "c0000";
  let usedWalkIn = false;

  const addCustomer = (name: string, city: string, joinedAt: string): Customer => {
    const key = name.trim().toLowerCase();
    const existing = customerByName.get(key);
    if (existing) {
      if (joinedAt && joinedAt < existing.joinedAt) existing.joinedAt = joinedAt;
      return existing;
    }
    const c: Customer = {
      id: `c${String(customers.length + 1).padStart(4, "0")}`,
      name: name.trim(),
      phone: "",
      city: city || "Unknown",
      joinedAt: joinedAt || new Date().toISOString().slice(0, 10),
      preferredLang: "bn",
    };
    customers.push(c);
    customerByName.set(key, c);
    return c;
  };

  const orders: Order[] = [];
  rawSales.forEach((s, i) => {
    const date = (s.date ?? "").trim();
    const productName = (s.product ?? "").trim();
    const product = productByName.get(productName.toLowerCase());
    if (!date || !product) return;

    const cname = (s.customer ?? "").trim();
    let customerId = WALK_IN_ID;
    if (cname) {
      customerId = addCustomer(cname, (s.city ?? "").trim(), date).id;
    } else {
      usedWalkIn = true;
    }

    const qty = Math.max(1, toNum(s.qty) || 1);
    const unitPrice = toNum(s.unit_price ?? s.price) || product.price;
    const item: OrderItem = { productId: product.id, qty, unitPrice };
    orders.push({
      id: `o${String(i + 1).padStart(5, "0")}`,
      customerId,
      date,
      items: [item],
      total: qty * unitPrice,
      paymentMethod: coercePayment(s.payment),
      status: coerceStatus(s.status),
      city: (s.city ?? "").trim() || "Unknown",
      courier: "pathao",
    });
  });

  if (usedWalkIn) {
    const earliest = orders.reduce((m, o) => (o.date < m ? o.date : m), orders[0]?.date ?? new Date().toISOString().slice(0, 10));
    customers.unshift({
      id: WALK_IN_ID,
      name: "Walk-in customers",
      phone: "",
      city: "Unknown",
      joinedAt: earliest,
      preferredLang: "bn",
    });
  }

  return { products, customers, orders };
}
