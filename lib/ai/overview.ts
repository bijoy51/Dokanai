import { getStore } from "@/lib/data/store";

export interface OverviewMetrics {
  revenue30: number;
  revenuePrev30: number;
  orders30: number;
  ordersPrev30: number;
  rtoRate: number;
  rtoRatePrev: number;
  repeatRate: number;
  repeatRatePrev: number;
  daily: { date: string; revenue: number; orders: number }[];
}

export function computeOverview(): OverviewMetrics {
  const store = getStore();
  const today = new Date();
  const cutoff30 = new Date(today);
  cutoff30.setDate(today.getDate() - 30);
  const cutoff60 = new Date(today);
  cutoff60.setDate(today.getDate() - 60);

  const orders = store.orders;

  const inWindow = (start: Date, end: Date) =>
    orders.filter((o) => {
      const d = new Date(o.date);
      return d >= start && d <= end;
    });

  const last30 = inWindow(cutoff30, today);
  const prev30 = inWindow(cutoff60, cutoff30);

  const sumRevenue = (arr: typeof orders) =>
    arr.filter((o) => o.status === "delivered").reduce((s, o) => s + o.total, 0);

  const rtoRate = (arr: typeof orders) => {
    const cod = arr.filter((o) => o.paymentMethod === "cod" && (o.status === "delivered" || o.status === "rto"));
    if (cod.length === 0) return 0;
    return (cod.filter((o) => o.status === "rto").length / cod.length) * 100;
  };

  const repeatRate = (arr: typeof orders) => {
    const byCust = new Map<string, number>();
    for (const o of arr) byCust.set(o.customerId, (byCust.get(o.customerId) ?? 0) + 1);
    if (byCust.size === 0) return 0;
    const repeats = [...byCust.values()].filter((n) => n > 1).length;
    return (repeats / byCust.size) * 100;
  };

  // Daily aggregation across last 30 days
  const days: { date: string; revenue: number; orders: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const dayOrders = orders.filter((o) => o.date === ds);
    days.push({
      date: ds.slice(5),
      revenue: dayOrders.filter((o) => o.status !== "rto" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0),
      orders: dayOrders.length,
    });
  }

  return {
    revenue30: sumRevenue(last30),
    revenuePrev30: sumRevenue(prev30),
    orders30: last30.length,
    ordersPrev30: prev30.length,
    rtoRate: rtoRate(last30),
    rtoRatePrev: rtoRate(prev30),
    repeatRate: repeatRate(last30),
    repeatRatePrev: repeatRate(prev30),
    daily: days,
  };
}

export function recentOrders(limit = 10) {
  const store = getStore();
  return [...store.orders]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((o) => ({
      id: o.id,
      customer: store.customerById(o.customerId)?.name ?? "·",
      total: o.total,
      status: o.status,
      date: o.date,
    }));
}
