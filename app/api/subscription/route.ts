import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getTier, setTier, type Tier } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/subscription            -> { tier } for the signed-in shop
 * GET /api/subscription?session_id -> verify a completed Stripe Checkout
 *                                     session belongs to this user, persist
 *                                     the tier, and return it.
 *
 * The session-id path is the demo-friendly confirm: it works even if the
 * Stripe webhook isn't configured, by verifying payment directly on the
 * success redirect. The webhook (/api/stripe/webhook) is the production path.
 */
export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (sessionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const cs = await stripe.checkout.sessions.retrieve(sessionId);
        const paid = cs.payment_status === "paid" || cs.status === "complete";
        const owns = (cs.metadata?.email ?? "").toLowerCase() === session.email.toLowerCase();
        const plan = cs.metadata?.plan as Tier | undefined;
        if (paid && owns && (plan === "growth" || plan === "pro")) {
          await setTier(session.email, plan, { status: cs.status ?? undefined, source: "stripe-confirm" });
        }
      } catch {
        /* fall through to returning current tier */
      }
    }
  }

  const tier = await getTier(session.email);
  return NextResponse.json({ tier });
}
