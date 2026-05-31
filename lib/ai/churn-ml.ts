/**
 * ML-backed churn prediction client.
 *
 * Server-side wrapper around ml-backend's POST /predict/churn. Extracts
 * RFM-style features from the existing in-memory store, posts them to
 * the backend's XGBoost predictor, and surfaces a calibrated probability
 * plus SHAP top-drivers.
 *
 * Caching:
 *   - Per-customer predictions are deterministic given current features,
 *     so we cache the response in the same shared KV the rest of the app
 *     uses, keyed as `churn-pred:<email>:<customer_id>`. TTL is set to
 *     6 hours via a `expiresAt` field (the KV itself has no TTL primitive
 *     yet — we just ignore expired entries on read).
 *
 * Graceful degradation:
 *   - If ML_BACKEND_URL / ML_ADMIN_SECRET aren't set, returns
 *     { available: false }. Callers (e.g. the Pilot tool) can show a
 *     friendly "ML predictor not configured" message.
 *   - If the backend hasn't been trained yet (no artifacts/churn/model.joblib),
 *     the backend responds with `ready: false`; we surface that as
 *     `{ available: false, reason: "..." }`.
 *
 * Existing features are NOT touched: rfmScores() and
 * list_customers_by_segment continue to use the rule-based segmentation.
 * This is an additional, optional, opt-in path.
 */
import { kvConfigured } from "@/lib/kv";
import { getStore } from "@/lib/data/store";
import { daysBetween } from "@/lib/utils";
import { thresholdsFor, type ChurnThresholds } from "@/lib/ai/churn";
import type { ProductCategory } from "@/lib/types";

const PREDICT_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches PDF §7.2

export interface ChurnPredictionDriver {
  feature: string;
  value: number;
  shap: number;
  direction: "increases_risk" | "decreases_risk";
}

export interface ChurnPrediction {
  available: true;
  customerId: string;
  customerName: string;
  category: string;
  thresholds: ChurnThresholds;
  probability: number;          // 0..1
  riskTier: "low" | "medium" | "high";
  topDrivers: ChurnPredictionDriver[];
  features: ChurnFeatures;
  modelVersion?: string;
  cached: boolean;
}

export interface ChurnUnavailable {
  available: false;
  reason: string;
}

export type ChurnPredictionResult = ChurnPrediction | ChurnUnavailable;

interface ChurnFeatures {
  recency_days: number;
  frequency_90d: number;
  monetary: number;
  avg_order_gap_days: number;
  tenure_days: number;
  cancel_rate: number;
}

/**
 * Compute the same RFM-ish features the model was trained on, derived
 * straight from the in-memory store (already hydrated by the
 * dashboard / agent request).
 */
export function computeChurnFeatures(customerId: string): {
  features: ChurnFeatures;
  category: ProductCategory | undefined;
  name: string;
} | null {
  const store = getStore();
  const customer = store.customerById(customerId);
  if (!customer) return null;
  const orders = store.ordersByCustomer(customerId);
  if (orders.length === 0) {
    return {
      features: {
        recency_days: 365,
        frequency_90d: 0,
        monetary: 0,
        avg_order_gap_days: 180,
        tenure_days: 0,
        cancel_rate: 0,
      },
      category: undefined,
      name: customer.name,
    };
  }
  const today = new Date();
  // Sort ascending by date for gap math.
  const dates = orders.map((o) => o.date).sort();
  const lastDate = dates[dates.length - 1];
  const firstDate = dates[0];
  const recency = daysBetween(lastDate, today);
  const tenure = daysBetween(firstDate, today);
  const ninetyAgo = new Date(today);
  ninetyAgo.setDate(today.getDate() - 90);
  const ninetyAgoStr = ninetyAgo.toISOString().slice(0, 10);
  const freq90 = orders.filter((o) => o.date >= ninetyAgoStr && o.status !== "cancelled").length;
  const monetary = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  // Average gap between consecutive orders (skip when only 1 order).
  let avgGap = 45;
  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const cancelRate = orders.length > 0 ? cancelled / orders.length : 0;

  // Most-purchased product's category (best proxy for "this customer's category").
  const catCount = new Map<ProductCategory, number>();
  for (const o of orders) {
    for (const it of o.items) {
      const p = store.productById(it.productId);
      if (!p) continue;
      catCount.set(p.category, (catCount.get(p.category) ?? 0) + it.qty);
    }
  }
  let topCategory: ProductCategory | undefined;
  let topQty = -1;
  for (const [cat, q] of catCount) {
    if (q > topQty) {
      topCategory = cat;
      topQty = q;
    }
  }

  return {
    features: {
      recency_days: recency,
      frequency_90d: freq90,
      monetary,
      avg_order_gap_days: Math.round(avgGap * 10) / 10,
      tenure_days: tenure,
      cancel_rate: Math.round(cancelRate * 1000) / 1000,
    },
    category: topCategory,
    name: customer.name,
  };
}

function mlConfig(): { base: string; secret: string } | null {
  const url = process.env.ML_BACKEND_URL?.trim();
  const secret = (process.env.ML_ADMIN_SECRET || process.env.ADMIN_SECRET || "").trim();
  if (!url || !secret) return null;
  return { base: url.replace(/\s+/g, "").replace(/\/+$/, ""), secret };
}

interface BackendResponse {
  ready?: boolean;
  error?: string;
  category?: string;
  category_thresholds?: { at_risk_days: number; churned_days: number };
  churn_probability?: number;
  risk_tier?: "low" | "medium" | "high";
  top_drivers?: ChurnPredictionDriver[];
  model_version?: string;
}

async function callBackend(
  category: string,
  features: ChurnFeatures,
): Promise<BackendResponse | null> {
  const cfg = mlConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.base}/predict/churn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": cfg.secret },
      body: JSON.stringify({ category, features }),
      signal: AbortSignal.timeout(PREDICT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendResponse;
  } catch {
    return null;
  }
}

interface CachedEntry {
  expiresAt: number;
  prediction: Omit<ChurnPrediction, "cached">;
}

async function readCache(email: string, customerId: string): Promise<ChurnPrediction | null> {
  if (!kvConfigured()) return null;
  try {
    const { kvGet } = await import("@/lib/kv");
    const rec = await kvGet<CachedEntry>(`churn-pred:${email}:${customerId}`);
    if (!rec || typeof rec.expiresAt !== "number") return null;
    if (rec.expiresAt < Date.now()) return null;
    return { ...rec.prediction, cached: true };
  } catch {
    return null;
  }
}

async function writeCache(
  email: string,
  customerId: string,
  prediction: Omit<ChurnPrediction, "cached">,
): Promise<void> {
  if (!kvConfigured()) return;
  try {
    const { kvPut } = await import("@/lib/kv");
    await kvPut(`churn-pred:${email}:${customerId}`, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      prediction,
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Main entry: get the ML-backed churn prediction for one customer.
 * Returns { available: false } when the backend is not configured / not
 * trained — caller surfaces a friendly message.
 */
export async function predictChurnForCustomer(
  email: string,
  customerId: string,
): Promise<ChurnPredictionResult> {
  const cached = await readCache(email, customerId);
  if (cached) return cached;

  const fc = computeChurnFeatures(customerId);
  if (!fc) return { available: false, reason: "Customer not found in this shop." };

  const cfg = mlConfig();
  if (!cfg) {
    return { available: false, reason: "ML predictor not configured (ML_BACKEND_URL / ML_ADMIN_SECRET unset)." };
  }
  const categoryStr = fc.category ?? "clothing";
  const resp = await callBackend(categoryStr, fc.features);
  if (!resp) return { available: false, reason: "ML backend unreachable." };
  if (resp.ready === false) {
    return {
      available: false,
      reason: resp.error || "Churn model not yet trained on the ML backend.",
    };
  }

  const prediction: Omit<ChurnPrediction, "cached"> = {
    available: true,
    customerId,
    customerName: fc.name,
    category: resp.category ?? categoryStr,
    thresholds: thresholdsFor(fc.category),
    probability: resp.churn_probability ?? 0,
    riskTier: resp.risk_tier ?? "low",
    topDrivers: resp.top_drivers ?? [],
    features: fc.features,
    modelVersion: resp.model_version,
  };
  await writeCache(email, customerId, prediction);
  return { ...prediction, cached: false };
}
