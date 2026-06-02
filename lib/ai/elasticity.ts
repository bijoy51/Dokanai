import { getStore } from "@/lib/data/store";
import type { Product, ProductCategory } from "@/lib/types";

/**
 * Per-product price-elasticity model.
 *
 * Methodology
 * -----------
 * For each product we gather (week, avg_unit_price, units_sold) tuples from
 * the order history. When we have enough distinct price points (>= 3 weeks
 * with materially different prices), we fit a log-log demand model
 *
 *     log(units) = a + b * log(price) + noise
 *
 * via ordinary least squares (closed-form 2-variable regression). The slope
 * `b` is the price elasticity of demand. When the data is too sparse, we
 * fall back to a category-level default that's reasonable for Bangladeshi
 * SME retail (clothing/electronics are elastic, food is inelastic).
 *
 * Interpretation of `elasticity`:
 *   b > -1   inelastic   -> raising price increases revenue
 *   b = -1   unit-elastic
 *   b < -1   elastic     -> lowering price increases revenue
 *
 * From `b` we derive a recommended price band:
 *   inelastic   : suggested = current * (1 + 0.5/(|b|+1))   (lean up, capped at +10%)
 *   elastic     : suggested = current * (1 - 0.4*(|b|-1)/|b|)  (lean down, capped at -15%)
 *   borderline  : hold
 *
 * Expected revenue impact uses the log-log identity
 *   pct_revenue_change ≈ (1 + b) * pct_price_change
 *
 * This is deliberately a CONSERVATIVE model — we cap moves at ±15% and the
 * caller layers on stock-position + festival signals (see ai/pricing.ts).
 */

export interface Elasticity {
  productId: string;
  /** Slope b of log-log fit. Typically negative; positive means data is too
   *  noisy to trust — we mark such products as "insufficient data". */
  elasticity: number;
  /** Coefficient of determination R² of the log-log fit (1 = perfect). */
  rSquared: number;
  /** How many distinct weekly (price, units) observations went into the fit. */
  sampleSize: number;
  /** True when we fell back to a category default rather than fitting. */
  fromDefault: boolean;
  /** Recommended price band derived from elasticity. Defaults to current price
   *  when the data is too sparse to recommend a move. */
  priceLow: number;
  priceHigh: number;
  /** Single point recommendation inside the band. */
  optimalPrice: number;
  /** Expected revenue change in percent at the optimal price vs current. */
  expectedRevenuePct: number;
  /** Human-readable interpretation. */
  classification: "inelastic" | "unit" | "elastic" | "insufficient";
}

const CATEGORY_DEFAULT: Record<ProductCategory, number> = {
  // Reasonable BD-retail priors — see literature on emerging-market FMCG /
  // electronics. Stated as elasticities (negative); we treat them as priors
  // until the data has enough variation to override.
  food: -0.6, //   staples + groceries — inelastic
  beauty: -1.3, //  semi-elastic
  home: -1.0, //   unit-elastic on average
  clothing: -1.5, //  elastic
  electronics: -2.2, //  highly elastic in SME segments
};

/** ISO week key of a date, e.g. "2026-W12" — coarse enough to absorb day-to-day
 *  noise but fine enough to surface promotional price changes. */
function weekKey(date: string): string {
  const d = new Date(date);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86_400_000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Group sales of a single product into weekly (avg_price, total_units). */
function weeklySamples(productId: string): Array<{ price: number; units: number }> {
  const store = getStore();
  const buckets = new Map<string, { qty: number; rev: number }>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    for (const it of o.items) {
      if (it.productId !== productId) continue;
      const k = weekKey(o.date);
      const cur = buckets.get(k) ?? { qty: 0, rev: 0 };
      cur.qty += it.qty;
      cur.rev += it.qty * it.unitPrice;
      buckets.set(k, cur);
    }
  }
  const out: Array<{ price: number; units: number }> = [];
  for (const v of buckets.values()) {
    if (v.qty <= 0) continue;
    out.push({ price: v.rev / v.qty, units: v.qty });
  }
  return out;
}

/** Closed-form OLS slope + R² for log-log regression on the given samples. */
function fitLogLog(samples: Array<{ price: number; units: number }>):
  | { slope: number; rSquared: number }
  | null
{
  if (samples.length < 3) return null;
  const distinctPrices = new Set(samples.map((s) => s.price.toFixed(2)));
  if (distinctPrices.size < 2) return null; //  no price variation -> no slope

  const xs = samples.map((s) => Math.log(s.price));
  const ys = samples.map((s) => Math.log(s.units));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;

  const slope = num / denX;
  const r = num / Math.sqrt(denX * denY);
  return { slope, rSquared: r * r };
}

/** Public: compute elasticity for one product (with category fallback). */
export function elasticityFor(p: Product): Elasticity {
  const samples = weeklySamples(p.id);
  const fit = fitLogLog(samples);

  let elasticity: number;
  let rSquared: number;
  let fromDefault: boolean;
  let sampleSize = samples.length;

  // Trust the fit when we have >= 4 samples AND R² > 0.2 AND slope is sensible
  // (negative — positive slopes signal mostly noise or supply-side effects).
  if (fit && samples.length >= 4 && fit.rSquared > 0.2 && fit.slope < 0) {
    elasticity = fit.slope;
    rSquared = fit.rSquared;
    fromDefault = false;
  } else {
    elasticity = CATEGORY_DEFAULT[p.category] ?? -1;
    rSquared = 0;
    fromDefault = true;
  }

  // Derive a recommended band.
  const absE = Math.abs(elasticity);
  let suggestedMultiplier = 1;
  let classification: Elasticity["classification"];

  if (sampleSize === 0) {
    classification = "insufficient";
  } else if (absE < 0.85) {
    classification = "inelastic";
    suggestedMultiplier = Math.min(1.1, 1 + 0.5 / (absE + 1));
  } else if (absE <= 1.15) {
    classification = "unit";
    suggestedMultiplier = 1; // unit-elastic -> revenue is invariant to price
  } else {
    classification = "elastic";
    suggestedMultiplier = Math.max(0.85, 1 - 0.4 * (absE - 1) / absE);
  }

  const optimalPrice = Math.round(p.price * suggestedMultiplier);
  // ±5% band around the optimal — gives the merchant a real "range to test".
  const priceLow = Math.round(optimalPrice * 0.95);
  const priceHigh = Math.round(optimalPrice * 1.05);

  // Expected revenue change at the optimal: log-log identity says
  // d(ln revenue) = (1 + b) * d(ln price).
  const pctPrice = (optimalPrice - p.price) / p.price;
  const expectedRevenuePct = Number(((1 + elasticity) * pctPrice * 100).toFixed(1));

  return {
    productId: p.id,
    elasticity: Number(elasticity.toFixed(2)),
    rSquared: Number(rSquared.toFixed(2)),
    sampleSize,
    fromDefault,
    priceLow,
    priceHigh,
    optimalPrice,
    expectedRevenuePct,
    classification,
  };
}

export function elasticityAll(): Elasticity[] {
  return getStore().products.map(elasticityFor);
}
