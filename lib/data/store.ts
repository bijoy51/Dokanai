import { CUSTOMERS, ORDERS, PRODUCTS } from "./seed";
import type { Customer, Order, Product } from "@/lib/types";

/**
 * In-memory data store. Lives across requests within a single
 * server instance. Sufficient for a Vercel-deployed MVP demo.
 */
export const store = {
  products: PRODUCTS,
  customers: CUSTOMERS,
  orders: ORDERS,

  productById(id: string): Product | undefined {
    return PRODUCTS.find((p) => p.id === id);
  },

  customerById(id: string): Customer | undefined {
    return CUSTOMERS.find((c) => c.id === id);
  },

  ordersByCustomer(id: string): Order[] {
    return ORDERS.filter((o) => o.customerId === id);
  },

  ordersByProduct(productId: string): Order[] {
    return ORDERS.filter((o) => o.items.some((i) => i.productId === productId));
  },
};
