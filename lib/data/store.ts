import { cookies } from "next/headers";
import { generateDataset } from "./seed";
import { getImported, type Dataset } from "./imported";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { Customer, Order, Product } from "@/lib/types";

/**
 * Per-account data store.
 *
 * - The demo account (demo@dokanai.app) always gets a synthetic seeded
 *   dataset so the product stays demoable.
 * - Every other account starts EMPTY and is populated only by importing
 *   real shop data (CSV) via the Khata-to-Cloud page. See lib/data/imported.
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

const DEMO_KEY = "demo@dokanai.app";
const storeCache = new Map<string, Store>();

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function makeStore(products: Product[], customers: Customer[], orders: Order[]): Store {
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

function syntheticStore(key: string): Store {
  const { products, customers, orders } = generateDataset(hashKey(key));
  return makeStore(products, customers, orders);
}

function emptyStore(): Store {
  return makeStore([], [], []);
}

/** Resolves the signed-in account's email from the session cookie. */
function currentEmail(): string {
  const session = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  return session?.email ?? DEMO_KEY;
}

/**
 * Returns the data store for the currently signed-in account.
 * Demo account -> synthetic seed. Any other account -> imported data if
 * present, otherwise an empty store.
 */
export function getStore(): Store {
  const email = currentEmail();

  if (email === DEMO_KEY) {
    let s = storeCache.get(email);
    if (!s) {
      s = syntheticStore(email);
      storeCache.set(email, s);
    }
    return s;
  }

  const imported: Dataset | undefined = getImported(email);
  if (imported) {
    // Rebuild each call is cheap; the imported dataset can change between
    // requests (re-import), so we key the cache on the dataset identity.
    const cacheKey = `${email}#imported`;
    let s = storeCache.get(cacheKey);
    if (!s || s.products !== imported.products) {
      s = makeStore(imported.products, imported.customers, imported.orders);
      storeCache.set(cacheKey, s);
    }
    return s;
  }

  return emptyStore();
}

/** True when the signed-in account has no shop data yet. */
export function isShopEmpty(): boolean {
  const s = getStore();
  return s.products.length === 0 && s.orders.length === 0;
}
