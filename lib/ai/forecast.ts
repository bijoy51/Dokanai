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

/**
 * Reference date used as the end of the trailing baseline window. We use
 * the most recent order date in the dataset rather than `new Date()` so
 * that users who imported historical CSVs still see a meaningful baseline
 * (otherwise the trailing 30-day average over wall-clock-recent days is
 * 0 and every forecast collapses to zero). Falls back to `new Date()`
 * when there are no orders at all.
 *
 * Forward iteration for forecasts + the chart still uses real `new Date()`
 * because festivals are calendar events, not data events.
 */
function referenceDate(): Date {
  const store = getStore();
  let maxIso = "";
  for (const o of store.orders) {
    if (o.date > maxIso) maxIso = o.date;
  }
  return maxIso ? new Date(maxIso) : new Date();
}

/** Trailing-N-day moving average daily demand ending at `referenceEnd`. */
function trailingAvg(byDay: Map<string, number>, referenceEnd: Date, days = 30): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(referenceEnd);
    d.setDate(referenceEnd.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    total += byDay.get(key) ?? 0;
  }
  return days > 0 ? total / days : 0;
}

export function forecastProduct(p: Product): ProductForecast {
  const byDay = unitsSoldByDay(p.id);
  const refEnd = referenceDate();
  const baseline = trailingAvg(byDay, refEnd, 30);

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
  const refEnd = referenceDate();
  const days: { date: string; units: number }[] = [];

  // Build per-product baselines off the dataset's most-recent-date window
  // (see referenceDate() above).
  const baselines = new Map<string, number>();
  for (const p of store.products) {
    const byDay = unitsSoldByDay(p.id);
    baselines.set(p.id, trailingAvg(byDay, refEnd, 30));
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
