import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { setTier, type Tier } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook — Stripe event sink (production path for tier state).
 *
 * Verifies the signature with STRIPE_WEBHOOK_SECRET, then on a completed
 * checkout persists the customer's tier. Env-gated: with no secret configured
 * it returns 200 (no-op) so an unconfigured deploy doesn't error — the
 * success-redirect confirm endpoint still keeps tiers correct for the demo.
 *
 * Configure in Stripe Dashboard -> Developers -> Webhooks, endpoint:
 *   https://dokanai.vercel.app/api/stripe/webhook   (event: checkout.session.completed)
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = getStripe();
  if (!secret || !stripe) {
    return NextResponse.json({ received: true, note: "webhook not configured" });
  }

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid signature";
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const cs = event.data.object as {
      metadata?: { email?: string; plan?: string };
      status?: string;
    };
    const email = cs.metadata?.email;
    const plan = cs.metadata?.plan as Tier | undefined;
    if (email && (plan === "growth" || plan === "pro")) {
      await setTier(email, plan, { status: cs.status ?? undefined, source: "stripe-webhook" });
    }
  }

  return NextResponse.json({ received: true });
}
