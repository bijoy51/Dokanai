/**
 * Stripe client + plan catalogue (server-only).
 *
 * Env-gated exactly like the Resend client: when STRIPE_SECRET_KEY is missing
 * (e.g. local dev without keys), getStripe() returns null and the checkout
 * route replies with a clean "not configured" error instead of throwing — no
 * other feature is affected.
 *
 * Sandbox / test mode: set STRIPE_SECRET_KEY to an `sk_test_...` key. The
 * publishable key is not needed server-side (we redirect to Stripe-hosted
 * Checkout), but it is documented in .env.example for completeness.
 *
 * Currency: defaults to BDT to match the ৳ pricing shown across the app.
 * Amounts are in the currency's smallest unit (poisha for BDT, so
 * ৳499 = 49900). If a Stripe account rejects BDT, set STRIPE_CURRENCY=usd and
 * adjust PLAN_AMOUNTS accordingly.
 */
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY?.trim();

export const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "bdt").toLowerCase();

/** Plan display names. */
export const PLANS: Record<string, { name: string }> = {
  growth: { name: "DokanAI Growth" },
  pro: { name: "DokanAI Pro" },
};

/**
 * unit_amount per (currency, plan) in the currency's smallest unit.
 * BDT: poisha (৳499 = 49900). USD: cents ($5 = 500). Falls back to USD for any
 * currency we haven't priced, so checkout never sends a BDT amount as USD.
 */
const PLAN_AMOUNTS: Record<string, Record<string, number>> = {
  bdt: { growth: 49900, pro: 149900 },
  usd: { growth: 500, pro: 1500 },
};

export function planAmount(plan: string): number | null {
  const table = PLAN_AMOUNTS[STRIPE_CURRENCY] ?? PLAN_AMOUNTS.usd;
  return table[plan] ?? null;
}

export function stripeConfigured(): boolean {
  return !!SECRET;
}

let client: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!SECRET) return null;
  if (!client) client = new Stripe(SECRET);
  return client;
}
