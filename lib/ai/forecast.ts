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

/** Aggregate shop-wide daily units sold (orders flattened to qty per date). */
function shopDailyTotals(): Map<string, number> {
  const store = getStore();
  const m = new Map<string, number>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    let qty = 0;
    for (const it of o.items) qty += it.qty;
    m.set(o.date, (m.get(o.date) ?? 0) + qty);
  }
  return m;
}

/**
 * Day-of-week demand multipliers indexed [Sun=0..Sat=6].
 *
 * Without seasonality, a forecast that's just baseline × festivalBoost is a
 * perfectly flat line whenever no festival is within its leadDays window —
 * which is most of the year. Real BD retail has a clear weekly rhythm
 * (Fri/Sat weekend lift, Sun midweek dip), so we fit one from the imported
 * data when possible and fall back to a sensible default when not.
 *
 * Smoothing: with only a few weeks of data, a single big-promo Friday can
 * over-fit the multiplier. We pull each raw ratio 40% back toward 1 and
 * clamp to [0.6, 1.5] so the curve stays informative without inventing
 * spikes that aren't there.
 */
function dayOfWeekMultipliers(): number[] {
  const dailyTotals = shopDailyTotals();
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const [dateStr, qty] of dailyTotals) {
    const dow = new Date(dateStr).getDay();
    sums[dow] += qty;
    counts[dow] += 1;
  }
  const avgs = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
  const observedDays = counts.reduce((a, b) => a + b, 0);
  const overallAvg = avgs.reduce((a, b) => a + b, 0) / 7;

  // Sun, Mon, Tue, Wed, Thu, Fri, Sat — BD retail weekend is Fri-Sat.
  const fallback = [0.93, 0.90, 0.92, 0.95, 1.02, 1.18, 1.10];
  // With <14 distinct sales days the fit is too noisy to trust on its own.
  if (overallAvg === 0 || observedDays < 14) return fallback;

  const SMOOTH = 0.4;
  return avgs.map((a, i) => {
    if (counts[i] === 0) return fallback[i];
    const raw = a / overallAvg;
    const smoothed = 1 + (raw - 1) * (1 - SMOOTH);
    return Math.max(0.6, Math.min(1.5, smoothed));
  });
}

/**
 * Short-term momentum: how the last 7 days compare to the last 30. A value
 * >1 means demand is accelerating, <1 cooling. Pulled halfway back to 1
 * and clamped to [0.7, 1.4] so a single quiet week doesn't crush every
 * forward-looking number.
 */
function trendMultiplier(): number {
  const dailyTotals = shopDailyTotals();
  if (dailyTotals.size === 0) return 1.0;
  const refEnd = referenceDate();
  let sum7 = 0;
  let sum30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(refEnd);
    d.setDate(refEnd.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = dailyTotals.get(key) ?? 0;
    sum30 += v;
    if (i < 7) sum7 += v;
  }
  const avg7 = sum7 / 7;
  const avg30 = sum30 / 30;
  if (avg30 === 0) return 1.0;
  const ratio = avg7 / avg30;
  const smoothed = 1 + (ratio - 1) * 0.5;
  return Math.max(0.7, Math.min(1.4, smoothed));
}

export function forecastProduct(p: Product): ProductForecast {
  const byDay = unitsSoldByDay(p.id);
  const refEnd = referenceDate();
  const baseline = trailingAvg(byDay, refEnd, 30);
  const dowMults = dayOfWeekMultipliers();
  const trend = trendMultiplier();

  let f7 = 0;
  let f30 = 0;
  let strongestBoost = 1;
  let dominantFestival: string | null = null;
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const { boost, festivalId } = festivalBoost(d, p.category);
    const expected = baseline * boost * dowMults[d.getDay()] * trend;
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

  const dowMults = dayOfWeekMultipliers();
  const trend = trendMultiplier();

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
    units *= dowMults[d.getDay()];
    units *= trend;

    // Keep one decimal place on small forecasts (sparse shops, slow days)
    // so the chart actually conveys the curve. Once the daily total is
    // material (>=20 units), nobody cares about the tenths digit.
    const rounded = units < 20 ? Math.round(units * 10) / 10 : Math.round(units);
    days.push({ date: ds.slice(5), units: rounded });
  }
  return days;
}

export function festivalCalendar() {
  return upcomingFestivals(new Date(), 60);
}
