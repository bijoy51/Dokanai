import { getStore } from "@/lib/data/store";
import { festivalBoost, upcomingFestivals } from "@/lib/data/festivals";
import type { Product } from "@/lib/types";

export interface ProductForecast {
  productId: string;
  name: string;
  nameBn: string;
  category: string;
  stock: number;
  avgDaily: number;
  forecastNext7: number;
  forecastNext30: number;
  daysOfStock: number;
  festivalBoost: number;
  festivalId: string | null;
}

/** Aggregate historical daily units sold per product. */
function unitsSoldByDay(productId: string): Map<string, number> {
  const store = getStore();
  const m = new Map<string, number>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    for (const it of o.items) {
      if (it.productId === productId) m.set(o.date, (m.get(o.date) ?? 0) + it.qty);
    }
  }
  return m;
}

/** Compute trailing-N-day moving average daily demand. */
function trailingAvg(byDay: Map<string, number>, days = 30): number {
  const today = new Date();
  let total = 0;
  let denom = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    total += byDay.get(key) ?? 0;
    denom += 1;
  }
  return denom > 0 ? total / denom : 0;
}

export function forecastProduct(p: Product): ProductForecast {
  const byDay = unitsSoldByDay(p.id);
  const baseline = trailingAvg(byDay, 30);

  let f7 = 0;
  let f30 = 0;
  let strongestBoost = 1;
  let dominantFestival: string | null = null;
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const { boost, festivalId } = festivalBoost(d, p.category);
    const expected = baseline * boost;
    if (i <= 7) f7 += expected;
    f30 += expected;
    if (boost > strongestBoost) {
      strongestBoost = boost;
      dominantFestival = festivalId;
    }
  }

  const dailyForward = f30 / 30;
  const daysOfStock = dailyForward > 0 ? p.stock / dailyForward : 999;

  return {
    productId: p.id,
    name: p.name,
    nameBn: p.nameBn,
    category: p.category,
    stock: p.stock,
    avgDaily: Number(baseline.toFixed(2)),
    forecastNext7: Math.round(f7),
    forecastNext30: Math.round(f30),
    daysOfStock: Number(daysOfStock.toFixed(1)),
    festivalBoost: Number(strongestBoost.toFixed(2)),
    festivalId: dominantFestival,
  };
}

export function forecastAll(): ProductForecast[] {
  return getStore().products.map(forecastProduct);
}

export function dailyForecastTotal(): { date: string; units: number }[] {
  const store = getStore();
  const today = new Date();
  const days: { date: string; units: number }[] = [];

  // Build per-product baselines
  const baselines = new Map<string, number>();
  for (const p of store.products) {
    const byDay = unitsSoldByDay(p.id);
    baselines.set(p.id, trailingAvg(byDay, 30));
  }

  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    let units = 0;
    for (const p of store.products) {
      const baseline = baselines.get(p.id) ?? 0;
      const { boost } = festivalBoost(d, p.category);
      units += baseline * boost;
    }
    days.push({ date: ds.slice(5), units: Math.round(units) });
  }
  return days;
}

export function festivalCalendar() {
  return upcomingFestivals(new Date(), 60);
}
