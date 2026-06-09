import { kvGet, kvPut } from "@/lib/kv";

/**
 * Subscription tier state, persisted in the durable KV under
 * `subscription:<email>`. Set by the Stripe success-confirm endpoint and the
 * Stripe webhook; read by feature gates (e.g. Autopilot) and the Subscription
 * page. Defaults to "free" — no existing feature depends on a paid tier, so a
 * missing record never breaks anything.
 */

export type Tier = "free" | "growth" | "pro";

const RANK: Record<Tier, number> = { free: 0, growth: 1, pro: 2 };

export interface SubscriptionRecord {
  tier: Tier;
  status?: string; // stripe subscription/session status
  updatedAt?: string;
  source?: "stripe-confirm" | "stripe-webhook";
}

const key = (email: string) => `subscription:${email.trim().toLowerCase()}`;

function normTier(v: unknown): Tier {
  return v === "growth" || v === "pro" ? v : "free";
}

export async function getTier(email: string): Promise<Tier> {
  if (!email) return "free";
  const rec = await kvGet<SubscriptionRecord>(key(email));
  return normTier(rec?.tier);
}

export async function setTier(
  email: string,
  tier: Tier,
  extra: Partial<SubscriptionRecord> = {},
): Promise<boolean> {
  if (!email) return false;
  const rec: SubscriptionRecord = { tier, updatedAt: new Date().toISOString(), ...extra };
  return kvPut(key(email), rec);
}

/** True when the account's tier is at least `min`. */
export async function hasTier(email: string, min: Tier): Promise<boolean> {
  const tier = await getTier(email);
  return RANK[tier] >= RANK[min];
}
