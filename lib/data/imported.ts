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

// ---------- shared-KV persistence (session-persistent, not a real DB) ----------
// The in-memory Map is per-instance and lost on a Vercel cold start, so the
// dataset is ALSO written to the shared KV (one Python dict in the HF Space).
// That KV survives Vercel cold starts and instance switches but does NOT
// survive HF container restarts — so we additionally keep a browser-side
// mirror in localStorage and DataSyncGuard (components/DataSyncGuard.tsx)
// silently replays it back into the KV if the server wakes up empty.
// hydrateImported() pulls the KV into the Map at the start of a request
// (see the dashboard layout), which is what lets the synchronous getStore()
// path find the data on any instance.

const kvKey = (email: string) => `dataset:${norm(email)}`;

function isDataset(v: unknown): v is Dataset {
  const d = v as Partial<Dataset> | null;
  return !!d && Array.isArray(d.products) && Array.isArray(d.customers) && Array.isArray(d.orders);
}

/** Persist a dataset to the shared KV. Best-effort: in-memory cache + browser
 *  mirror are layered backups (see DataSyncGuard for the rehydration path). */
export async function persistImported(email: string, d: Dataset): Promise<boolean> {
  return kvPut(kvKey(email), d);
}

/**
 * Ensure this instance's Map has the account's dataset, pulling it from the
 * KV on a cache miss. No-op when the KV isn't configured (local dev) or the
 * account already has data cached on this instance.
 *
 * Caching strategy:
 *   - The in-memory `store` Map is the primary cache and lives for the full
 *     lifetime of the Vercel instance — every subsequent request on this
 *     instance reads from RAM with zero KV cost.
 *   - Concurrent first-request fetches (multiple pages opened at once on a
 *     cold instance) are de-duplicated via the `inFlight` map below so the
 *     KV is hit at most ONCE per cold-start per account, not once per
 *     concurrent render.
 */
const inFlight = new Map<string, Promise<void>>();

export async function hydrateImported(email: string): Promise<void> {
  if (!kvConfigured()) {
    console.log("[imported] hydrate skipped: KV not configured — in-memory only");
    return;
  }
  const e = norm(email);
  if (store.has(e)) return; // already cached on this instance
  const existing = inFlight.get(e);
  if (existing) {
    await existing;
    return;
  }
  const promise = (async () => {
    try {
      const d = await kvGet<Dataset>(kvKey(e));
      if (isDataset(d)) store.set(e, d);
    } finally {
      inFlight.delete(e);
    }
  })();
  inFlight.set(e, promise);
  await promise;
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
  /** Optional customer email — enables email-marketing campaigns. */
  email?: string;
  /** Optional marketing opt-in: "true" / "yes" / "1" enable it. Anything
   *  else (or missing) leaves the customer unsubscribed by default. */
  consent?: string;
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

const TRUTHY_CONSENT = new Set(["true", "yes", "y", "1", "opted_in", "opt-in", "subscribed", "subscribe"]);
/** Permissive consent parser. Anything not explicitly truthy is treated as
 *  NOT opted in — defaults err on the side of not emailing without consent. */
function isConsented(v: string | undefined): boolean {
  if (!v) return false;
  return TRUTHY_CONSENT.has(v.trim().toLowerCase());
}
/** Email validation kept intentionally permissive (RFC-ish, not strict). */
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
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

  const addCustomer = (
    name: string,
    city: string,
    joinedAt: string,
    email?: string,
    consent?: string,
  ): Customer => {
    const key = name.trim().toLowerCase();
    const existing = customerByName.get(key);
    if (existing) {
      if (joinedAt && joinedAt < existing.joinedAt) existing.joinedAt = joinedAt;
      // Enrich with email/consent if a later row supplies them.
      if (email && !existing.email) existing.email = email.trim().toLowerCase();
      if (consent && existing.subscribed !== true) {
        existing.subscribed = isConsented(consent);
      }
      return existing;
    }
    const e = email?.trim().toLowerCase();
    const c: Customer = {
      id: `c${String(customers.length + 1).padStart(4, "0")}`,
      name: name.trim(),
      phone: "",
      city: city || "Unknown",
      joinedAt: joinedAt || new Date().toISOString().slice(0, 10),
      preferredLang: "bn",
      ...(e && isValidEmail(e) ? { email: e } : {}),
      // Default: NOT subscribed. Only opt in when consent column says so.
      subscribed: isConsented(consent),
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
      customerId = addCustomer(cname, (s.city ?? "").trim(), date, s.email, s.consent).id;
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

// ---------- append-only merge ----------

export interface ImportDelta {
  productsAdded: number;
  productsUpdated: number;
  customersAdded: number;
  ordersAdded: number;
  duplicatesSkipped: number;
}

export interface MergeResult {
  dataset: Dataset;
  delta: ImportDelta;
}

/** Stable signature for an order — used to dedupe re-uploads (especially
 *  from Live Sync, which pushes the full sheet on every edit). */
function orderSignature(date: string, productName: string, customerName: string, qty: number, total: number): string {
  return `${date}|${productName.trim().toLowerCase()}|${customerName.trim().toLowerCase()}|${qty}|${total}`;
}

/**
 * Append-only merge: starts from the existing Dataset and folds new raw
 * rows into it instead of replacing. Used by every import path so previous
 * uploads are preserved.
 *
 *   - Products dedupe by lowercased name. Existing product ID is kept (so
 *     historical orders still reference it) but price + stock are updated
 *     to the latest values from the new upload, since those are the
 *     fields the shopkeeper would want refreshed.
 *   - Customers dedupe by lowercased name. Earliest joinedAt wins; email
 *     and consent are filled in from later rows if missing.
 *   - Orders dedupe by a stable content signature so re-pushing the same
 *     sheet doesn't double-count sales.
 */
export function mergeDataset(
  existing: Dataset | undefined,
  rawProducts: RawProduct[],
  rawSales: RawSale[],
): MergeResult {
  // Cold path — first import for this account.
  if (!existing || (!existing.products.length && !existing.orders.length)) {
    const fresh = buildDataset(rawProducts, rawSales);
    return {
      dataset: fresh,
      delta: {
        productsAdded: fresh.products.length,
        productsUpdated: 0,
        customersAdded: fresh.customers.length,
        ordersAdded: fresh.orders.length,
        duplicatesSkipped: 0,
      },
    };
  }

  // Start mutable copies — we won't reassign IDs.
  const products: Product[] = [...existing.products];
  const customers: Customer[] = [...existing.customers];
  const orders: Order[] = [...existing.orders];

  const productByName = new Map<string, Product>();
  for (const p of products) productByName.set(p.name.trim().toLowerCase(), p);
  const customerByName = new Map<string, Customer>();
  for (const c of customers) customerByName.set(c.name.trim().toLowerCase(), c);
  const orderSigs = new Set<string>();
  for (const o of orders) {
    const cust = customers.find((c) => c.id === o.customerId);
    for (const it of o.items) {
      const prod = products.find((p) => p.id === it.productId);
      if (!prod || !cust) continue;
      orderSigs.add(orderSignature(o.date, prod.name, cust.name, it.qty, o.total));
    }
  }

  let productsAdded = 0;
  let productsUpdated = 0;
  let customersAdded = 0;
  let ordersAdded = 0;
  let duplicatesSkipped = 0;

  const nextProductId = () => `p${String(products.length + 1).padStart(3, "0")}`;
  const nextCustomerId = () => `c${String(customers.length + 1).padStart(4, "0")}`;

  const addOrUpdateProduct = (
    name: string,
    category: string | undefined,
    price: number,
    cost: number,
    stock: number,
  ): Product => {
    const key = name.trim().toLowerCase();
    const existingProd = productByName.get(key);
    if (existingProd) {
      // Latest data wins for the fields the shopkeeper would want refreshed.
      let changed = false;
      if (price > 0 && existingProd.price !== price) { existingProd.price = price; changed = true; }
      if (cost > 0 && existingProd.cost !== cost) { existingProd.cost = cost; changed = true; }
      if (stock > 0 && existingProd.stock !== stock) { existingProd.stock = stock; changed = true; }
      if (changed) productsUpdated++;
      return existingProd;
    }
    const p: Product = {
      id: nextProductId(),
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
    productsAdded++;
    return p;
  };

  const addOrUpdateCustomer = (
    name: string,
    city: string,
    joinedAt: string,
    email?: string,
    consent?: string,
  ): Customer => {
    const key = name.trim().toLowerCase();
    const existingCust = customerByName.get(key);
    if (existingCust) {
      if (joinedAt && joinedAt < existingCust.joinedAt) existingCust.joinedAt = joinedAt;
      if (email && !existingCust.email && isValidEmail(email.trim().toLowerCase())) {
        existingCust.email = email.trim().toLowerCase();
      }
      if (consent && existingCust.subscribed !== true) {
        existingCust.subscribed = isConsented(consent);
      }
      return existingCust;
    }
    const e = email?.trim().toLowerCase();
    const c: Customer = {
      id: nextCustomerId(),
      name: name.trim(),
      phone: "",
      city: city || "Unknown",
      joinedAt: joinedAt || new Date().toISOString().slice(0, 10),
      preferredLang: "bn",
      ...(e && isValidEmail(e) ? { email: e } : {}),
      subscribed: isConsented(consent),
    };
    customers.push(c);
    customerByName.set(key, c);
    customersAdded++;
    return c;
  };

  // 1. Products from the products sheet.
  for (const rp of rawProducts) {
    const name = (rp.name ?? rp.title ?? "").trim();
    if (!name) continue;
    addOrUpdateProduct(name, rp.category, toNum(rp.price), toNum(rp.cost), toNum(rp.stock));
  }

  // 2. Products that appear only in sales — created with stock 0 the first time.
  for (const s of rawSales) {
    const name = (s.product ?? "").trim();
    if (!name) continue;
    if (!productByName.has(name.toLowerCase())) {
      addOrUpdateProduct(name, undefined, toNum(s.unit_price ?? s.price), 0, 0);
    }
  }

  // 3. Sales -> orders. Dedupe by content signature.
  const WALK_IN_ID = "c0000";
  let walkIn = customers.find((c) => c.id === WALK_IN_ID);
  let walkInUsed = !!walkIn;

  rawSales.forEach((s, i) => {
    const date = (s.date ?? "").trim();
    const productName = (s.product ?? "").trim();
    const product = productByName.get(productName.toLowerCase());
    if (!date || !product) return;

    const cname = (s.customer ?? "").trim();
    let customer: Customer;
    if (cname) {
      customer = addOrUpdateCustomer(cname, (s.city ?? "").trim(), date, s.email, s.consent);
    } else {
      walkInUsed = true;
      if (!walkIn) {
        walkIn = {
          id: WALK_IN_ID,
          name: "Walk-in customers",
          phone: "",
          city: "Unknown",
          joinedAt: date,
          preferredLang: "bn",
        };
        customers.unshift(walkIn);
      } else if (date < walkIn.joinedAt) {
        walkIn.joinedAt = date;
      }
      customer = walkIn;
    }

    const qty = Math.max(1, toNum(s.qty) || 1);
    const unitPrice = toNum(s.unit_price ?? s.price) || product.price;
    const total = qty * unitPrice;

    const sig = orderSignature(date, product.name, customer.name, qty, total);
    if (orderSigs.has(sig)) {
      duplicatesSkipped++;
      return;
    }
    orderSigs.add(sig);

    const item: OrderItem = { productId: product.id, qty, unitPrice };
    orders.push({
      id: `o${String(orders.length + 1).padStart(5, "0")}_${i}`,
      customerId: customer.id,
      date,
      items: [item],
      total,
      paymentMethod: coercePayment(s.payment),
      status: coerceStatus(s.status),
      city: (s.city ?? "").trim() || "Unknown",
      courier: "pathao",
    });
    ordersAdded++;
  });

  // Tolerate either presence of walk-in customer (sales-only re-imports).
  void walkInUsed;

  return {
    dataset: { products, customers, orders },
    delta: { productsAdded, productsUpdated, customersAdded, ordersAdded, duplicatesSkipped },
  };
}
