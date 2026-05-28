/**
 * Audience -> recipients resolver.
 *
 * Takes a free-text audience descriptor (e.g. "at-risk customers",
 * "dormant", "vip", "all") plus the signed-in shop's data and returns the
 * list of customers eligible for an email campaign:
 *   1) belongs to the audience,
 *   2) has a valid email,
 *   3) is opted in (subscribed === true) and not unsubscribed.
 *
 * Walk-in customers (no name) are always excluded.
 */
import { getStore } from "@/lib/data/store";
import { rfmScores, type Segment } from "@/lib/ai/churn";
import { pendingCodRisks } from "@/lib/ai/rto";
import type { Customer } from "@/lib/types";

export interface Recipient {
  customerId: string;
  name: string;
  email: string;
  locale: "en" | "bn";
}

/** Audience kinds the resolver can produce. "rto" is not an RFM segment — it
 *  is the set of customers tied to a pending COD order at medium or high RTO
 *  risk (computed by lib/ai/rto.pendingCodRisks). */
export type AudienceKind = Segment | "all" | "rto";

const SEGMENT_KEYWORDS: Record<Segment, string[]> = {
  atrisk: ["at-risk", "at risk", "atrisk", "risky"],
  dormant: ["dormant", "inactive", "winback", "win-back", "lapsed"],
  vip: ["vip", "top customer", "best customer", "loyal high"],
  loyal: ["loyal"],
  new: ["new"],
};

// "rto" must be checked BEFORE the atrisk keyword "risk" so an explicit
// "rto risk" descriptor doesn't get classified as RFM at-risk.
const RTO_KEYWORDS = ["rto", "rto risk", "rto-risk", "return-to-origin", "return to origin", "cod risk", "cod-risk"];

/** Heuristic: pick the first segment whose keyword appears in the descriptor. */
function detectSegment(descriptor: string): AudienceKind {
  const d = descriptor.toLowerCase();
  if (RTO_KEYWORDS.some((kw) => d.includes(kw))) return "rto";
  for (const seg of Object.keys(SEGMENT_KEYWORDS) as Segment[]) {
    if (SEGMENT_KEYWORDS[seg].some((kw) => d.includes(kw))) return seg;
  }
  if (d.includes("all") || d.includes("everyone") || d.includes("subscribers")) return "all";
  return "all";
}

const WALK_IN_ID = "c0000";

function eligible(c: Customer): boolean {
  if (c.id === WALK_IN_ID) return false;
  if (!c.email) return false;
  if (c.subscribed !== true) return false;
  if (c.unsubscribedAt) return false;
  return true;
}

export interface ResolveResult {
  segment: AudienceKind;
  /** Recipients that will actually receive the email. */
  recipients: Recipient[];
  /** Diagnostics so the cron worker can log a one-line summary. */
  stats: {
    audienceCount: number;
    withEmail: number;
    optedIn: number;
  };
}

/**
 * Resolve recipients from an audience descriptor. Uses the in-memory store
 * (callers must hydrateImported() first so the store reflects the latest
 * persisted dataset on this serverless instance).
 */
export function resolveAudience(descriptor: string): ResolveResult {
  const seg = detectSegment(descriptor);
  const store = getStore();

  let inAudience: Customer[];
  if (seg === "all") {
    inAudience = store.customers;
  } else if (seg === "rto") {
    // Customers tied to a pending COD order at medium or high RTO risk.
    const risky = pendingCodRisks().filter((r) => r.riskLevel !== "low");
    const ids = new Set<string>();
    for (const order of store.orders) {
      if (!risky.some((r) => r.orderId === order.id)) continue;
      ids.add(order.customerId);
    }
    inAudience = store.customers.filter((c) => ids.has(c.id));
  } else {
    const segIds = new Set(rfmScores().filter((s) => s.segment === seg).map((s) => s.customerId));
    inAudience = store.customers.filter((c) => segIds.has(c.id));
  }

  const audienceCount = inAudience.filter((c) => c.id !== WALK_IN_ID).length;
  const withEmail = inAudience.filter((c) => c.id !== WALK_IN_ID && !!c.email).length;
  const eligibles = inAudience.filter(eligible);

  return {
    segment: seg,
    recipients: eligibles.map((c) => ({
      customerId: c.id,
      name: c.name,
      email: c.email!.toLowerCase(),
      locale: c.preferredLang === "en" ? "en" : "bn",
    })),
    stats: {
      audienceCount,
      withEmail,
      optedIn: eligibles.length,
    },
  };
}
