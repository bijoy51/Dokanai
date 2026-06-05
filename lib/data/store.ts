import { cookies } from "next/headers";
import { getImported, type Dataset } from "./imported";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { Customer, Order, Product } from "@/lib/types";

/**
 * Per-account data store.
 *
 * Every account starts EMPTY and is populated only by importing real shop
 * data (CSV / photos / PDF / Live Sync) via the Khata-to-Cloud page. See
 * lib/data/imported. Pages that read from getStore() must be inside an
 * authenticated route — without a session, getStore() returns an empty
 * store and isShopEmpty() returns true, which routes the user to the
 * onboarding state.
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

const storeCache = new Map<string, Store>();

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

function emptyStore(): Store {
  return makeStore([], [], []);
}

/** Resolves the signed-in account's email. Empty string when unauthenticated. */
function currentEmail(): string {
  const session = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  return session?.email ?? "";
}

/**
 * Returns the data store for the currently signed-in account.
 * Imported data if present, otherwise an empty store. Callers should
 * already be inside an auth-gated route (dashboard layout enforces this).
 */
export function getStore(): Store {
  const email = currentEmail();
  if (!email) return emptyStore();

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
