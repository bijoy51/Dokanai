import { cookies } from "next/headers";
import { generateDataset } from "./seed";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { Customer, Order, Product } from "@/lib/types";

/**
 * Per-account in-memory store. Each logged-in account gets its own
 * deterministic dataset, seeded from the account email, so dashboards
 * are isolated. Datasets are cached for the lifetime of the server
 * instance.
 */

export interface Store {
  products: Product[];
  customers: Customer[];
  orders: Order[];
  productById(id: string): Product | undefined;
  customerById(id: string): Customer | undefined;
  ordersByCustomer(id: string): Order[];
  ordersByProduct(productId: string): Order[];
  /** scratch space for memoized derived structures (e.g. similarity matrix) */
  _cache: Map<string, unknown>;
}

const DEFAULT_KEY = "demo@dokanai.app";
const storeCache = new Map<string, Store>();

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function buildStore(key: string): Store {
  const { products, customers, orders } = generateDataset(hashKey(key));
  return {
    products,
    customers,
    orders,
    productById: (id) => products.find((p) => p.id === id),
    customerById: (id) => customers.find((c) => c.id === id),
    ordersByCustomer: (id) => orders.filter((o) => o.customerId === id),
    ordersByProduct: (productId) => orders.filter((o) => o.items.some((i) => i.productId === productId)),
    _cache: new Map(),
  };
}

/**
 * Resolves the current account key from the session cookie.
 * Calling cookies() makes the caller dynamically rendered, so each
 * request gets the right account's dataset.
 */
function currentKey(): string {
  const session = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  return session?.email ?? DEFAULT_KEY;
}

/** Returns the data store for the currently signed-in account. */
export function getStore(): Store {
  const key = currentKey();
  let s = storeCache.get(key);
  if (!s) {
    s = buildStore(key);
    storeCache.set(key, s);
  }
  return s;
}
