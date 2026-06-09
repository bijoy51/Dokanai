import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStripe, stripeConfigured, STRIPE_CURRENCY, PLANS, planAmount } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout  { plan: "growth" | "pro", locale?: "en" | "bn" }
 *
 * Creates a Stripe-hosted Checkout Session (subscription mode, sandbox/test)
 * for the signed-in shop and returns { url } to redirect the browser to.
 * No card data ever touches our server — Stripe hosts the payment page.
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured: STRIPE_SECRET_KEY is missing. Add it in Vercel env and redeploy." },
      { status: 503 },
    );
  }
  const stripe = getStripe()!;

  let body: { plan?: string; locale?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body -> handled below */
  }

  const planKey = String(body.plan ?? "");
  const plan = PLANS[planKey];
  const amount = planAmount(planKey);
  if (!plan || amount == null) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const locale = body.locale === "bn" ? "bn" : "en";

  // Browser origin is the most reliable base for the redirect URLs; fall back
  // to APP_ORIGIN, then the request URL's own origin.
  const origin =
    process.env.APP_ORIGIN?.replace(/\/+$/, "") ||
    req.headers.get("origin") ||
    new URL(req.url).origin;

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            product_data: { name: plan.name },
            unit_amount: amount,
            recurring: { interval: "month" },
          },
        },
      ],
      success_url: `${origin}/${locale}/dashboard/subscription?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${locale}/dashboard/subscription?status=cancel`,
      metadata: { email: session.email, plan: planKey },
    });

    if (!checkout.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
